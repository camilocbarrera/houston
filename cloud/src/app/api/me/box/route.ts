//! GET /api/me/box — the signed-in user's current box, or null if none yet.

import { NextResponse } from "next/server";
import { buildControlPlane } from "@/lib/server/control-plane";
import { getUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }

  try {
    const box = await buildControlPlane().store.getByUser(userId);
    return NextResponse.json({ box });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
