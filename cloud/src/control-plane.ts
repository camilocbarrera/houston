//! Control-plane logic.
//!
//! Pure orchestration over a `SandboxProvider` + `BoxStore`, framework-agnostic
//! so it can sit behind any HTTP layer (and be unit-tested without one). The
//! core operation is provision-or-get: one box per user, reused across calls.

import {
  type ProvisionRequest,
  type SandboxHandle,
  type SandboxProvider,
} from "@/sandbox/types";
import { type BoxStore } from "@/store/types";

/** Engine secrets every provisioned box boots with. The control plane holds
 *  these once (from its own env) and stamps them into each box. */
export interface EngineSecrets {
  anthropicApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export interface ControlPlane {
  provider: SandboxProvider;
  store: BoxStore;
  secrets: EngineSecrets;
}

/**
 * Return the user's box, provisioning one the first time. Idempotent: a second
 * call for the same user returns the stored handle without provisioning again
 * (enforces one box per user).
 */
export async function provisionOrGet(
  cp: ControlPlane,
  userId: string,
): Promise<SandboxHandle> {
  const existing = await cp.store.getByUser(userId);
  if (existing) return existing;

  const req: ProvisionRequest = {
    userId,
    anthropicApiKey: cp.secrets.anthropicApiKey,
    supabaseUrl: cp.secrets.supabaseUrl,
    supabaseServiceRoleKey: cp.secrets.supabaseServiceRoleKey,
  };
  const handle = await cp.provider.provision(req);
  await cp.store.save(userId, handle);
  return handle;
}

/** Tear down a user's box and forget it. */
export async function destroyForUser(
  cp: ControlPlane,
  userId: string,
): Promise<void> {
  const existing = await cp.store.getByUser(userId);
  if (!existing) return;
  await cp.provider.destroy(existing.id);
  await cp.store.remove(userId);
}
