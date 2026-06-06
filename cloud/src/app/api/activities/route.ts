//! GET  /api/activities?agentPath=… — list an agent's activities (board items).
//! POST /api/activities — create a mission: make the activity, then start its
//!   session (sessionKey = `activity-<id>`), mirroring the desktop/mobile
//!   create-mission flow. Rolls the activity back if the session fails to start.

import { NextResponse } from "next/server";
import { buildControlPlane } from "@/lib/server/control-plane";
import {
  createActivity,
  deleteActivity,
  listActivities,
  startSession,
  type EngineTarget,
} from "@/lib/server/engine";
import { getUserId } from "@/lib/supabase/server";
import { mirrorActivities } from "@/lib/server/activity-mirror";

export const runtime = "nodejs";
export const maxDuration = 60;

async function boxForUser(): Promise<EngineTarget | { error: string; status: number }> {
  const userId = await getUserId();
  if (!userId) return { error: "You must be signed in", status: 401 };
  const box = await buildControlPlane().store.getByUser(userId);
  if (!box) return { error: "Deploy your engine first", status: 409 };
  return box;
}

const TITLE_MAX = 40;
function autoTitle(text: string): string {
  const t = text.trim();
  if (t.length <= TITLE_MAX) return t || "New mission";
  const slice = t.slice(0, TITLE_MAX);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd()}...`;
}

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  const box = await buildControlPlane().store.getByUser(userId);
  if (!box) return NextResponse.json({ error: "Deploy your engine first" }, { status: 409 });
  const agentPath = new URL(req.url).searchParams.get("agentPath");
  if (!agentPath) {
    return NextResponse.json({ error: "agentPath is required" }, { status: 400 });
  }
  try {
    const activities = await listActivities(box, agentPath);
    // Mirror to the shared Supabase table so the desktop (and any client that
    // doesn't call the box) can render the same board. Best-effort: a mirror
    // failure must not break the board read, so we log and still return.
    try {
      await mirrorActivities(userId, agentPath, activities);
    } catch (mirrorErr) {
      console.error("[activities] Supabase mirror failed:", mirrorErr);
    }
    return NextResponse.json({ activities });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const box = await boxForUser();
  if ("error" in box) return NextResponse.json({ error: box.error }, { status: box.status });
  try {
    const { agentPath, prompt } = (await req.json()) as { agentPath?: string; prompt?: string };
    if (!agentPath || !prompt?.trim()) {
      return NextResponse.json({ error: "agentPath and prompt are required" }, { status: 400 });
    }
    const text = prompt.trim();
    const activity = await createActivity(box, agentPath, {
      title: autoTitle(text),
      description: text,
      status: "running",
    });
    const sessionKey = `activity-${activity.id}`;
    try {
      await startSession(box, agentPath, { sessionKey, prompt: text });
    } catch (e) {
      // Roll back the orphaned activity so the board doesn't show a dead card.
      await deleteActivity(box, agentPath, activity.id).catch(() => {});
      throw e;
    }
    return NextResponse.json({ activity, sessionKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
