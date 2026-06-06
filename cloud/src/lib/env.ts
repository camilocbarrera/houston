//! Env access with fail-fast validation. Server-only secrets must never be
//! imported into client components (they read `publicEnv` only).

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Safe in the browser (`NEXT_PUBLIC_*`). */
export const publicEnv = {
  SUPABASE_URL: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  // Accept the newer publishable key (`sb_publishable_...`) or the legacy JWT
  // anon key (`eyJ...`). If Realtime ever fails to authenticate, fall back to
  // the JWT anon key — historically only the JWT authenticated Realtime.
  SUPABASE_ANON_KEY: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
};

/** Server-only. Never read these from a client component. */
export const serverEnv = {
  serviceRoleKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  anthropicApiKey: () =>
    required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
  /** `upstash` (default) or `mock`. */
  sandboxProvider: () => process.env.SANDBOX_PROVIDER ?? "upstash",
};
