//! POST /api/composio/login — begin Composio login. Returns a `login_url` the
//! user opens in their browser and a `cli_key` to pass back to
//! /api/composio/login/complete once approved (headless paste-back flow).

import { NextResponse } from "next/server";
import { boxForUser, isBoxError } from "@/lib/server/box-for-user";
import { composioStartLogin } from "@/lib/server/engine";

export const runtime = "nodejs";

export async function POST() {
  const box = await boxForUser();
  if (isBoxError(box)) return NextResponse.json({ error: box.error }, { status: box.status });
  try {
    return NextResponse.json(await composioStartLogin(box));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
