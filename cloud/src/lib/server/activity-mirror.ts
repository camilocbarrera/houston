//! Mirror an agent's activities (board missions) into the shared
//! `houston_activities` Supabase table.
//!
//! The board's content isn't in the `houston_events` stream (events only signal
//! "changed"), so other clients — notably the desktop, which must NOT call the
//! box directly — can't reconstruct it. The web app already fetches activities
//! from the box and holds the service-role key, so it write-throughs them here:
//! every board read upserts the current set and prunes anything deleted. The
//! desktop then renders the board straight from Supabase (read + Realtime),
//! never touching the box. Supabase is the shared source of truth (agora model).

import { createAdminClient } from "@/lib/supabase/admin";
import type { Activity } from "./engine";

/**
 * Upsert the given activities for (user, agent) and delete any rows that are no
 * longer present (deleted on the box). Best-effort: a mirror failure must not
 * break the board read that triggered it, so the caller logs and continues.
 */
export async function mirrorActivities(
  userId: string,
  agentPath: string,
  activities: Activity[],
): Promise<void> {
  const admin = createAdminClient();

  const rows = activities.map((a) => ({
    user_id: userId,
    agent_path: agentPath,
    id: a.id,
    title: a.title ?? "",
    description: a.description ?? "",
    status: a.status ?? "",
    session_key: a.session_key ?? null,
    updated_at: a.updated_at ?? new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await admin.from("houston_activities").upsert(rows);
    if (error) throw new Error(`activity upsert failed: ${error.message}`);
  }

  // Prune rows for this agent that the box no longer has (deleted missions).
  const ids = activities.map((a) => a.id);
  let del = admin
    .from("houston_activities")
    .delete()
    .eq("user_id", userId)
    .eq("agent_path", agentPath);
  if (ids.length > 0) {
    del = del.not("id", "in", `(${ids.join(",")})`);
  }
  const { error } = await del;
  if (error) throw new Error(`activity prune failed: ${error.message}`);
}
