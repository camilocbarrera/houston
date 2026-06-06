//! POST /api/provision — provision-or-get the signed-in user's engine box.
//!
//! Idempotent: returns the existing box if one is provisioned, else boots a new
//! one (one box per user). The engine bearer token is the user's own and is
//! returned so the client can call the box directly over REST.

import { NextResponse } from "next/server";
import { provisionOrGet } from "@/control-plane";
import { buildControlPlane } from "@/lib/server/control-plane";
import { getUserId } from "@/lib/supabase/server";

// Provisioning a box can take a while; opt out of the short edge default.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }

  try {
    const box = await provisionOrGet(buildControlPlane(), userId);
    return NextResponse.json({ box });
  } catch (err) {
    // Surface the real reason — beta policy: no silent failures.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
