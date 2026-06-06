//! POST /api/chat/send — start (or continue) a chat turn on the user's box.
//!
//! Body: `{ agentPath, sessionKey, prompt }`. The engine runs the turn and
//! streams its reply as `FeedItem` HoustonEvents → the in-box cloud sink →
//! Supabase → the browser's Realtime feed. So this route returns as soon as
//! the turn is accepted; the assistant's reply arrives over the event channel,
//! not in this response.

import { NextResponse } from "next/server";
import { buildControlPlane } from "@/lib/server/control-plane";
import { startSession } from "@/lib/server/engine";
import { getUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
// A turn can run for a while; the engine accepts it quickly, but keep headroom.
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  try {
    const { agentPath, sessionKey, prompt } = (await req.json()) as {
      agentPath?: string;
      sessionKey?: string;
      prompt?: string;
    };
    if (!agentPath || !sessionKey || !prompt?.trim()) {
      return NextResponse.json(
        { error: "agentPath, sessionKey and prompt are required" },
        { status: 400 },
      );
    }
    const box = await buildControlPlane().store.getByUser(userId);
    if (!box) {
      return NextResponse.json({ error: "Deploy your engine first" }, { status: 409 });
    }
    const result = await startSession(box, agentPath, { sessionKey, prompt: prompt.trim() });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
