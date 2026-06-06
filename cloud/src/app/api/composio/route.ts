//! GET /api/composio — Composio state for the Integrations tab: auth status,
//! and (once authed) the toolkit catalog + the user's connected toolkits.

import { NextResponse } from "next/server";
import { boxForUser, isBoxError } from "@/lib/server/box-for-user";
import { composioApps, composioConnections, composioStatus } from "@/lib/server/engine";

export const runtime = "nodejs";

export async function GET() {
  const box = await boxForUser();
  if (isBoxError(box)) return NextResponse.json({ error: box.error }, { status: box.status });
  try {
    const status = await composioStatus(box);
    // The catalog + connections need the user's Composio key (set at login), so
    // only fetch them once authenticated.
    const [apps, connections] =
      status.status === "ok"
        ? await Promise.all([composioApps(box), composioConnections(box)])
        : [[], []];
    return NextResponse.json({ status, apps, connections });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
