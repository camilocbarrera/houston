//! The agent's Activity board — the SAME @houston-ai/board AIBoard the desktop
//! renders (kanban Running / Needs you / Done + the detail-panel chat), wired to
//! cloud data: activities come from the engine (REST), the chat feed streams in
//! over Supabase (useChatFeed), sends go through the cloud API routes.
//!
//! AIBoard pulls heavy client-only deps (framer-motion, portals), so the shell
//! that renders this is dynamically imported with ssr:false.

"use client";

import { AIBoard } from "@houston-ai/board";
import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useRef } from "react";
import type { Activity } from "@/lib/server/engine";
import type { SessionRunStatus } from "@/lib/use-chat-feed";

// Same three columns + status groupings as the desktop (mission-board-columns.ts).
const COLUMNS = [
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "needs_you", label: "Needs you", statuses: ["needs_you", "error"] },
  { id: "done", label: "Done", statuses: ["done", "cancelled"] },
];

const sessionKeyFor = (id: string) => `activity-${id}`;

function toItem(a: Activity): KanbanItem {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    status: a.status,
    updatedAt: a.updated_at ?? "",
  };
}

interface CloudBoardProps {
  agentPath: string;
  agentName: string;
  activities: Activity[];
  feedItems: Record<string, FeedItem[]>;
  statuses: Record<string, SessionRunStatus>;
  /** Refetch activities after a create (engine also nudges via ActivityChanged). */
  onMutated: () => void;
  onError: (message: string) => void;
}

export function CloudBoard({
  agentPath,
  agentName,
  activities,
  feedItems,
  statuses,
  onMutated,
  onError,
}: CloudBoardProps) {
  const openNewRef = useRef<(() => void) | null>(null);

  const isLoading: Record<string, boolean> = {};
  for (const [sk, st] of Object.entries(statuses)) {
    isLoading[sk] = st === "starting" || st === "running";
  }

  const onCreateConversation = useCallback(
    async (text: string): Promise<string> => {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPath, prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Failed to create mission");
        throw new Error(data.error ?? "create failed");
      }
      onMutated();
      return data.activity.id as string;
    },
    [agentPath, onMutated, onError],
  );

  const onSendMessage = useCallback(
    async (sessionKey: string, text: string): Promise<void> => {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPath, sessionKey, prompt: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "Send failed");
      }
    },
    [agentPath, onError],
  );

  const columns = COLUMNS.map((c) =>
    c.id === "running"
      ? { ...c, onAdd: () => openNewRef.current?.(), addLabel: "New mission" }
      : c,
  );

  return (
    <AIBoard
      items={activities.map(toItem)}
      columns={columns}
      runningStatuses={["running"]}
      approveStatuses={["needs_you"]}
      errorStatuses={["error"]}
      feedItems={feedItems}
      isLoading={isLoading}
      sessionKeyFor={sessionKeyFor}
      onCreateConversation={onCreateConversation}
      onSendMessage={onSendMessage}
      onNewPanelOpenerReady={(opener) => {
        openNewRef.current = () => opener();
      }}
      panelAgentName={agentName}
      onNotice={onError}
    />
  );
}
