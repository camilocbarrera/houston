//! Upstash Box sandbox provider.
//!
//! Boots a per-user box that runs the Houston engine and exposes its REST API
//! through Upstash's preview URL (`box.getPreviewUrl(7777)`). Events do NOT flow
//! back over this URL — the in-box engine forwards them to Supabase Realtime
//! (the cloud sink), so the preview URL only serves REST commands. That's why we
//! never depend on WebSocket-over-preview, which Upstash leaves undocumented.
//!
//! The provider depends on a narrow [`UpstashBoxSdk`] port rather than the
//! `@upstash/box` package directly, so every method is unit-testable against a
//! fake. The real adapter ([`liveUpstashSdk`]) dynamically imports the package,
//! keeping it an optional runtime dependency for mock-only code paths.
//!
//! Auth model: a single token. The preview URL is exposed openly and the engine
//! is protected by its own `HOUSTON_ENGINE_TOKEN` (every engine route already
//! requires `Authorization: Bearer <token>`). Preview-level bearer auth can be
//! layered on later for defense-in-depth.

import type { BoxConfig } from "@upstash/box";
import {
  type ProvisionRequest,
  type SandboxHandle,
  type SandboxProvider,
  type SandboxStatus,
} from "@/sandbox/types";

/** Port the engine listens on inside the box. Matches the always-on image. */
const ENGINE_PORT = 7777;

/** Minimal slice of a live `@upstash/box` instance the provider uses. The real
 *  `Box` class is a structural superset, so the live adapter returns it as-is. */
export interface UpstashBoxInstance {
  readonly id: string;
  exec: { command(cmd: string): Promise<unknown> };
  getPreviewUrl(
    port: number,
    options?: { bearerToken?: boolean; basicAuth?: boolean },
  ): Promise<{ url: string; token?: string }>;
  getStatus(): Promise<{ status: string }>;
  resume(): Promise<void>;
  delete(): Promise<void>;
}

/** Narrow port over the `@upstash/box` SDK statics, so the provider is testable. */
export interface UpstashBoxSdk {
  create(config: BoxConfig): Promise<UpstashBoxInstance>;
  get(id: string): Promise<UpstashBoxInstance>;
}

/** Durable storage root inside the box. `/workspace` persists across freeze /
 *  restore, so the engine's data + workspaces survive an idle box waking up. */
const WORKSPACE_HOME = "/workspace/home/.houston";

/**
 * Builds the engine env + launch command for a provision request.
 *
 * The box (Debian bookworm, aarch64) already ships `claude` + `codex` on PATH,
 * so the only thing missing is the engine itself. We can't use Box's
 * `initCommand` — it does NOT run on a fresh keep-alive box — so instead we run
 * `launchCommand` via `box.exec` after create: it downloads the prebuilt
 * `houston-engine` linux/arm64 binary into `~/.local/bin` (on PATH) and starts
 * it **detached** (`setsid … &`) so it outlives the exec call. State lives under
 * `/workspace` so it survives the box freezing when idle. Secrets travel in
 * `env` (delivered via `Box.create({env})` and inherited by the process), never
 * in the command string.
 */
export function engineBootSpec(
  req: ProvisionRequest,
  token: string,
  engineBinaryUrl: string,
): { launchCommand: string; env: Record<string, string> } {
  const env: Record<string, string> = {
    HOUSTON_BIND: `0.0.0.0:${ENGINE_PORT}`,
    HOUSTON_BIND_ALL: "1",
    HOUSTON_NO_PARENT_WATCHDOG: "1",
    HOUSTON_HOME: WORKSPACE_HOME,
    HOUSTON_DOCS: `${WORKSPACE_HOME}/workspaces`,
    HOUSTON_ENGINE_TOKEN: token,
    HOUSTON_CLOUD_USER_ID: req.userId,
    SUPABASE_URL: req.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: req.supabaseServiceRoleKey,
    ANTHROPIC_API_KEY: req.anthropicApiKey,
  };

  const bin = "$HOME/.local/bin/houston-engine";
  const script = [
    "set -e",
    `mkdir -p "$HOME/.local/bin" "${WORKSPACE_HOME}"`,
    // Re-download only if missing, so a resumed box reuses the cached binary.
    `[ -x "${bin}" ] || { curl -fsSL "${engineBinaryUrl}" -o "${bin}" && chmod +x "${bin}"; }`,
    'cd "$HOME"',
    // Detached so the engine keeps running after this exec call returns.
    `setsid "${bin}" >"${WORKSPACE_HOME}/engine.log" 2>&1 </dev/null & echo houston-engine-launched`,
  ].join("; ");

  return { launchCommand: `bash -lc '${script}'`, env };
}

/** Map Upstash's box status string onto our coarse lifecycle states. */
export function mapStatus(raw: string): SandboxStatus {
  const s = raw.toLowerCase();
  if (s.includes("run") || s.includes("ready") || s.includes("active")) return "running";
  if (s.includes("paus") || s.includes("idle") || s.includes("frozen")) return "frozen";
  if (s.includes("stop") || s.includes("delet") || s.includes("terminat")) return "stopped";
  return "unknown";
}

export interface UpstashBoxProviderOptions {
  /** SDK port. Defaults to the live `@upstash/box` adapter. */
  sdk?: UpstashBoxSdk;
  /** Box size. Defaults to "medium". */
  size?: BoxConfig["size"];
  /** Generate the engine bearer token. Injectable for deterministic tests. */
  generateToken?: () => string;
  /** URL of the prebuilt `houston-engine` linux/arm64 binary the box downloads.
   *  Defaults to `HOUSTON_ENGINE_BINARY_URL`. Required to boot a real engine. */
  engineBinaryUrl?: string;
}

export class UpstashBoxProvider implements SandboxProvider {
  readonly name = "upstash";

  private readonly sdk: UpstashBoxSdk;
  private readonly size: BoxConfig["size"];
  private readonly generateToken: () => string;
  private readonly engineBinaryUrl: string;

  constructor(options: UpstashBoxProviderOptions = {}) {
    this.sdk = options.sdk ?? liveUpstashSdk();
    this.size = options.size ?? "medium";
    this.generateToken = options.generateToken ?? defaultToken;
    this.engineBinaryUrl =
      options.engineBinaryUrl ?? process.env.HOUSTON_ENGINE_BINARY_URL ?? "";
  }

  async provision(req: ProvisionRequest): Promise<SandboxHandle> {
    if (!this.engineBinaryUrl) {
      throw new Error(
        "UpstashBoxProvider: no engine binary URL (set HOUSTON_ENGINE_BINARY_URL)",
      );
    }
    const token = this.generateToken();
    const { launchCommand, env } = engineBootSpec(req, token, this.engineBinaryUrl);

    const box = await this.sdk.create({
      runtime: "node",
      size: this.size,
      keepAlive: true, // always-on server, not a bursty job
      env,
    });

    // Download + start the engine detached. (Box's initCommand does not run on
    // a fresh keep-alive box, so we bootstrap over exec.)
    await box.exec.command(launchCommand);

    const { url } = await box.getPreviewUrl(ENGINE_PORT);

    return {
      id: box.id,
      baseUrl: url.replace(/\/$/, ""),
      token,
      provider: this.name,
    };
  }

  async status(id: string): Promise<SandboxStatus> {
    const box = await this.sdk.get(id);
    const { status } = await box.getStatus();
    return mapStatus(status);
  }

  async wake(id: string): Promise<void> {
    const box = await this.sdk.get(id);
    await box.resume();
  }

  async destroy(id: string): Promise<void> {
    const box = await this.sdk.get(id);
    await box.delete();
  }
}

/** Live adapter over `@upstash/box`, imported lazily so the package stays an
 *  optional runtime dependency for mock-only code paths. The real `Box` class is
 *  a structural superset of [`UpstashBoxInstance`]. */
export function liveUpstashSdk(): UpstashBoxSdk {
  return {
    async create(config) {
      const { Box } = await import("@upstash/box");
      return Box.create(config);
    },
    async get(id) {
      const { Box } = await import("@upstash/box");
      return Box.get(id);
    },
  };
}

function defaultToken(): string {
  // 48-char url-safe token, matching the engine's own gen_token length.
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
