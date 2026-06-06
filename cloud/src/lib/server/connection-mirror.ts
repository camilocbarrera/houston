//! Mirror the box's connected Composio toolkits into the shared
//! `houston_connections` Supabase table so every client (incl. the desktop,
//! which doesn't call the box) shows the same integrations. Parallels
//! agent-mirror / activity-mirror. Best-effort: never break the read.

import { createAdminClient } from "@/lib/supabase/admin";

export async function mirrorConnections(userId: string, toolkits: string[]): Promise<void> {
  const admin = createAdminClient();

  if (toolkits.length > 0) {
    const rows = toolkits.map((toolkit) => ({
      user_id: userId,
      toolkit,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from("houston_connections").upsert(rows);
    if (error) throw new Error(`connection upsert failed: ${error.message}`);
  }

  // Prune toolkits the user disconnected on the box.
  let del = admin.from("houston_connections").delete().eq("user_id", userId);
  if (toolkits.length > 0) {
    del = del.not("toolkit", "in", `(${toolkits.join(",")})`);
  }
  const { error } = await del;
  if (error) throw new Error(`connection prune failed: ${error.message}`);
}
