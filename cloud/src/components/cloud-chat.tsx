//! The same chat surface the desktop app uses (`@houston-ai/chat`'s ChatPanel),
//! wired to the cloud transport: feed items arrive via Supabase Realtime
//! (`useChatFeed`), sends POST to `/api/chat/send` which starts a turn on the
//! user's box.
//!
//! ChatPanel pulls in heavy client-only deps (framer-motion, shiki, streamdown),
//! so it's dynamically imported with `ssr: false` — Next never renders it on the
//! server where there's no `window`.

"use client";

import type { FeedItem } from "@houston-ai/chat";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

const ChatPanel = dynamic(() => import("@houston-ai/chat").then((m) => m.ChatPanel), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-muted-foreground">Loading chat…</div>,
});

interface CloudChatProps {
  agentPath: string;
  sessionKey: string;
  feedItems: FeedItem[];
  /** Engine-reported run state for this session (drives the streaming UI). */
  running: boolean;
  onError: (message: string) => void;
}

export function CloudChat({
  agentPath,
  sessionKey,
  feedItems,
  running,
  onError,
}: CloudChatProps) {
  // Local optimism so the composer locks the instant you hit send, before the
  // first SessionStatus event makes the round-trip back over Supabase.
  const [sending, setSending] = useState(false);
  const busy = sending || running;

  const onSend = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      setSending(true);
      try {
        const res = await fetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentPath, sessionKey, prompt }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Send failed");
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        // The engine's user_message + reply now stream in over Supabase; clear
        // local optimism and let the live run status drive the UI.
        setSending(false);
      }
    },
    [agentPath, sessionKey, onError],
  );

  return (
    <ChatPanel
      sessionKey={sessionKey}
      feedItems={feedItems}
      onSend={onSend}
      isLoading={busy}
      status={busy ? "streaming" : "ready"}
      placeholder="Message your cloud agent…"
    />
  );
}
