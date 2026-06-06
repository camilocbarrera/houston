//! Supabase-backed box store.
//!
//! Persists the user → box mapping in `public.houston_boxes` (see
//! `supabase/migrations/*_cloud_boxes.sql`). Uses the service-role key: the
//! control plane is a trusted server, and the row holds the engine token, which
//! end users read back through RLS (own row only).

import { type SupabaseClient } from "@supabase/supabase-js";
import { type SandboxHandle } from "@/sandbox/types";
import { type BoxStore } from "@/store/types";

const TABLE = "houston_boxes";

interface BoxRow {
  user_id: string;
  sandbox_id: string;
  provider: string;
  base_url: string;
  token: string;
}

export class SupabaseBoxStore implements BoxStore {
  constructor(private readonly client: SupabaseClient) {}

  async getByUser(userId: string): Promise<SandboxHandle | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("user_id, sandbox_id, provider, base_url, token")
      .eq("user_id", userId)
      .maybeSingle<BoxRow>();
    if (error) {
      throw new Error(`box store read failed: ${error.message}`);
    }
    return data ? rowToHandle(data) : null;
  }

  async save(userId: string, handle: SandboxHandle): Promise<void> {
    const row: BoxRow = {
      user_id: userId,
      sandbox_id: handle.id,
      provider: handle.provider,
      base_url: handle.baseUrl,
      token: handle.token,
    };
    const { error } = await this.client
      .from(TABLE)
      .upsert(row, { onConflict: "user_id" });
    if (error) {
      throw new Error(`box store write failed: ${error.message}`);
    }
  }

  async remove(userId: string): Promise<void> {
    const { error } = await this.client.from(TABLE).delete().eq("user_id", userId);
    if (error) {
      throw new Error(`box store delete failed: ${error.message}`);
    }
  }
}

function rowToHandle(row: BoxRow): SandboxHandle {
  return {
    id: row.sandbox_id,
    baseUrl: row.base_url,
    token: row.token,
    provider: row.provider,
  };
}
