//! POST /api/composio/login/complete { cliKey } — finish the login the user
//! approved in their browser, using the cli_key from /api/composio/login.

import { NextResponse } from "next/server";
import { boxForUser, isBoxError } from "@/lib/server/box-for-user";
import { composioCompleteLogin } from "@/lib/server/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const box = await boxForUser();
  if (isBoxError(box)) return NextResponse.json({ error: box.error }, { status: box.status });
  try {
    const { cliKey } = (await req.json()) as { cliKey?: string };
    if (!cliKey?.trim()) {
      return NextResponse.json({ error: "cliKey is required" }, { status: 400 });
    }
    await composioCompleteLogin(box, cliKey.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
