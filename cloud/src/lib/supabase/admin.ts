//! Service-role Supabase client for the control plane. Bypasses RLS — used only
//! in server route handlers to read/write the `houston_boxes` mapping. NEVER
//! import this into a client component.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

let admin: SupabaseClient | undefined;

export function createAdminClient(): SupabaseClient {
  if (admin) return admin;
  admin = createClient(publicEnv.SUPABASE_URL, serverEnv.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
