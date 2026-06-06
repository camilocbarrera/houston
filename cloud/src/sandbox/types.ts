//! Swappable sandbox backend.
//!
//! Houston Cloud runs one engine box per user. Upstash Box is the first
//! backend, but the brand must be swappable (another vendor, or a proprietary
//! box). Everything the control plane needs from a backend is the
//! `SandboxProvider` interface below — add a new implementor + a `registry`
//! entry and nothing else changes. This mirrors the engine's `ProviderAdapter`
//! + REGISTRY pattern for AI providers, one layer up.

/** A provisioned sandbox running the Houston engine. */
export interface SandboxHandle {
  /** Provider-scoped sandbox id (e.g. an Upstash Box id). */
  id: string;
  /** Public base URL of the engine's REST API inside the sandbox. */
  baseUrl: string;
  /** Bearer token clients send to the engine (its `HOUSTON_ENGINE_TOKEN`). */
  token: string;
  /** Which provider minted this handle — routes status/wake/destroy back. */
  provider: string;
}

export type SandboxStatus = "running" | "frozen" | "stopped" | "unknown";

/** Engine config a freshly-provisioned box must boot with. */
export interface ProvisionRequest {
  /** Cloud user this box serves; becomes the engine's `HOUSTON_CLOUD_USER_ID`. */
  userId: string;
  /** Anthropic key for the in-box agent CLIs (Claude Code, etc.). */
  anthropicApiKey: string;
  /** Supabase project the in-box engine forwards events to (the cloud sink). */
  supabaseUrl: string;
  /** Service-role key the in-box engine inserts events with (bypasses RLS). */
  supabaseServiceRoleKey: string;
}

/**
 * A sandbox backend. One box per user; the box runs the Houston engine and
 * exposes its REST API at `SandboxHandle.baseUrl`.
 */
export interface SandboxProvider {
  /** Stable id, e.g. `"upstash"`. Stamped into `SandboxHandle.provider`. */
  readonly name: string;
  /** Boot a box running the engine and return how to reach it. */
  provision(req: ProvisionRequest): Promise<SandboxHandle>;
  /** Current state of a box by id. */
  status(id: string): Promise<SandboxStatus>;
  /** Un-freeze an idle box so it can serve again. */
  wake(id: string): Promise<void>;
  /** Tear a box down for good. */
  destroy(id: string): Promise<void>;
}
