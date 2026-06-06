//! GET  /api/agents — list the user's agents (ensures the cloud workspace +
//!                     a default agent exist on first call).
//! POST /api/agents — create an additional named agent (multi-agent).
//!
//! Both require a provisioned box; the engine lives inside it. Auth is the
//! signed-in Supabase user; the box is loaded from the per-user store.

import { NextResponse } from "next/server";
import { buildControlPlane } from "@/lib/server/control-plane";
import { createNamedAgent, ensureWorkspaceAgent } from "@/lib/server/bootstrap";
import { mirrorAgents } from "@/lib/server/agent-mirror";
import { getUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  try {
    const box = await buildControlPlane().store.getByUser(userId);
    if (!box) {
      return NextResponse.json({ error: "Deploy your engine first" }, { status: 409 });
    }
    const { workspaceId, agents } = await ensureWorkspaceAgent(box);
    // Mirror the roster so the desktop (and any non-box client) shows the same
    // agents. Best-effort — never break the list on a mirror failure.
    try {
      await mirrorAgents(userId, workspaceId, agents);
    } catch (mirrorErr) {
      console.error("[agents] Supabase mirror failed:", mirrorErr);
    }
    return NextResponse.json({ workspaceId, agents });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }
    const box = await buildControlPlane().store.getByUser(userId);
    if (!box) {
      return NextResponse.json({ error: "Deploy your engine first" }, { status: 409 });
    }
    const { workspaceId, agents } = await ensureWorkspaceAgent(box);
    // Pick the next palette color by roster position so the new agent's helmet
    // is visually distinct from the existing ones.
    const agent = await createNamedAgent(box, workspaceId, name.trim(), agents.length);
    return NextResponse.json({ agent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
