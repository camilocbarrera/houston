//! Sandbox provider registry.
//!
//! Selects the backend by the `SANDBOX_PROVIDER` env var. Swapping the box
//! brand is a one-line change here plus a new implementor — no control-plane
//! code changes. Mirrors the engine's AI-provider REGISTRY.

import { MockSandboxProvider } from "@/sandbox/mock";
import { type SandboxProvider } from "@/sandbox/types";
import { UpstashBoxProvider } from "@/sandbox/upstash-box";

export type SandboxProviderName = "upstash" | "mock";

/** Build a provider by name. Unknown names throw — we never silently fall back
 *  to a different backend than the operator asked for. */
export function makeSandboxProvider(name: string): SandboxProvider {
  switch (name) {
    case "upstash":
      return new UpstashBoxProvider();
    case "mock":
      return new MockSandboxProvider();
    default:
      throw new Error(
        `Unknown SANDBOX_PROVIDER "${name}" (expected "upstash" or "mock")`,
      );
  }
}

/** Resolve the provider from env, defaulting to Upstash Box. */
export function sandboxProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): SandboxProvider {
  return makeSandboxProvider(env.SANDBOX_PROVIDER ?? "upstash");
}
