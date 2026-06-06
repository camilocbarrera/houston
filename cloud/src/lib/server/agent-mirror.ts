//! Mirror the box's agent roster into the shared `houston_agents` Supabase
//! table so every client (notably the desktop, which must not call the box)
//! shows the same agents. Parallels `activity-mirror.ts`. Best-effort: a mirror
//! failure must not break the agent list, so the caller logs and continues.

import { createAdminClient } from "@/lib/supabase/admin";
import type { Agent } from "./engine";

export async function mirrorAgents(
  userId: string,
  workspaceId: string,
  agents: Agent[],
): Promise<void> {
  const admin = createAdminClient();

  const rows = agents.map((a) => ({
    user_id: userId,
    workspace_id: workspaceId,
    id: a.id,
    name: a.name ?? "",
    folder_path: a.folderPath ?? "",
    color: a.color ?? null,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await admin.from("houston_agents").upsert(rows);
    if (error) throw new Error(`agent upsert failed: ${error.message}`);
  }

  // Prune agents this user no longer has (deleted on the box).
  const ids = agents.map((a) => a.id);
  let del = admin.from("houston_agents").delete().eq("user_id", userId);
  if (ids.length > 0) {
    del = del.not("id", "in", `(${ids.join(",")})`);
  }
  const { error } = await del;
  if (error) throw new Error(`agent prune failed: ${error.message}`);
}
