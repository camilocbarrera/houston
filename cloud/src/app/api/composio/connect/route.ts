//! POST /api/composio/connect { toolkit } — start linking a toolkit. Returns a
//! `redirect_url` the user opens to authorize it, and starts the engine's
//! connection watcher so a `ComposioConnectionAdded` event fires (→ Supabase →
//! every client flips the toolkit to "Connected") once it lands.

import { NextResponse } from "next/server";
import { boxForUser, isBoxError } from "@/lib/server/box-for-user";
import { composioConnect, composioWatch } from "@/lib/server/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const box = await boxForUser();
  if (isBoxError(box)) return NextResponse.json({ error: box.error }, { status: box.status });
  try {
    const { toolkit } = (await req.json()) as { toolkit?: string };
    if (!toolkit?.trim()) {
      return NextResponse.json({ error: "toolkit is required" }, { status: 400 });
    }
    const link = await composioConnect(box, toolkit.trim());
    // Fire-and-forget the watcher; failing to watch shouldn't block returning
    // the redirect URL the user needs to open.
    composioWatch(box, toolkit.trim()).catch(() => {});
    return NextResponse.json(link);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
