//! Persistence for the user → box mapping.
//!
//! One box per user (the architecture decision), so the store is keyed by user
//! id. Swappable like the sandbox provider: Supabase in production, in-memory
//! for tests / offline demo.

import { type SandboxHandle } from "@/sandbox/types";

export interface BoxStore {
  /** Current box for a user, or null if none provisioned yet. */
  getByUser(userId: string): Promise<SandboxHandle | null>;
  /** Persist (upsert) the box for a user. */
  save(userId: string, handle: SandboxHandle): Promise<void>;
  /** Forget a user's box (after destroy). */
  remove(userId: string): Promise<void>;
}
