//! Resolve the signed-in user's box for a route handler, or a typed error to
//! return. Shared by the composio routes (and anything else that proxies REST
//! to the per-user box).

import { buildControlPlane } from "@/lib/server/control-plane";
import type { EngineTarget } from "@/lib/server/engine";
import { getUserId } from "@/lib/supabase/server";

export type BoxOrError = EngineTarget | { error: string; status: number };

export async function boxForUser(): Promise<BoxOrError> {
  const userId = await getUserId();
  if (!userId) return { error: "You must be signed in", status: 401 };
  const box = await buildControlPlane().store.getByUser(userId);
  if (!box) return { error: "Deploy your engine first", status: 409 };
  return box;
}

export function isBoxError(b: BoxOrError): b is { error: string; status: number } {
  return "error" in b;
}
