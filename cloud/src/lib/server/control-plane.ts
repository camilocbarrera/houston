//! Server-side wiring of the control plane from env.
//!
//! Builds a `ControlPlane` (swappable sandbox provider + box store + engine
//! secrets) for the API route handlers. Store selection mirrors provider
//! selection: Supabase when a service-role key is present, in-memory otherwise
//! (so `SANDBOX_PROVIDER=mock` + no Supabase runs the whole flow offline in
//! `next dev`).

import { type ControlPlane, type EngineSecrets } from "@/control-plane";
import { makeSandboxProvider } from "@/sandbox/registry";
import { InMemoryBoxStore } from "@/store/memory";
import { SupabaseBoxStore } from "@/store/supabase";
import { type BoxStore } from "@/store/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, serverEnv } from "@/lib/env";

/** In-memory store persists only within one running dev server — fine for the
 *  offline mock demo, never used when a service-role key is configured. */
const devStore = new InMemoryBoxStore();

function storeFromEnv(): BoxStore {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseBoxStore(createAdminClient());
  }
  return devStore;
}

/** Real secrets are required for a real backend; the mock provider ignores
 *  them, so the offline demo can run without them. */
function secretsFor(providerName: string): EngineSecrets {
  if (providerName === "mock") {
    return {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "mock",
      supabaseUrl: publicEnv.SUPABASE_URL,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "mock",
    };
  }
  return {
    anthropicApiKey: serverEnv.anthropicApiKey(),
    supabaseUrl: publicEnv.SUPABASE_URL,
    supabaseServiceRoleKey: serverEnv.serviceRoleKey(),
  };
}

export function buildControlPlane(): ControlPlane {
  const providerName = serverEnv.sandboxProvider();
  return {
    provider: makeSandboxProvider(providerName),
    store: storeFromEnv(),
    secrets: secretsFor(providerName),
  };
}
