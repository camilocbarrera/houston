// Live gate test: provision a box the way UpstashBoxProvider now does
// (Box.create + exec bootstrap + getPreviewUrl), then poll /v1/health WITH the
// token. Deletes the box at the end unless KEEP=1.
//   cd cloud && node --env-file=.env.local scripts/verify-provision.mjs
import { randomUUID } from "node:crypto";
import { Box } from "@upstash/box";

const ENGINE_PORT = 7777;
const WS = "/workspace/home/.houston";
const url = process.env.HOUSTON_ENGINE_BINARY_URL;
if (!url) throw new Error("HOUSTON_ENGINE_BINARY_URL not set");

const token = "verify-" + Math.random().toString(36).slice(2);
const env = {
  HOUSTON_BIND: `0.0.0.0:${ENGINE_PORT}`,
  HOUSTON_BIND_ALL: "1",
  HOUSTON_NO_PARENT_WATCHDOG: "1",
  HOUSTON_HOME: WS,
  HOUSTON_DOCS: `${WS}/workspaces`,
  HOUSTON_ENGINE_TOKEN: token,
  HOUSTON_CLOUD_USER_ID: randomUUID(),
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

const bin = "$HOME/.local/bin/houston-engine";
const launch = `bash -lc 'set -e; mkdir -p "$HOME/.local/bin" "${WS}"; [ -x "${bin}" ] || { curl -fsSL "${url}" -o "${bin}" && chmod +x "${bin}"; }; cd "$HOME"; setsid "${bin}" >"${WS}/engine.log" 2>&1 </dev/null & echo launched'`;

console.log("creating box...");
const box = await Box.create({ runtime: "node", size: "medium", keepAlive: true, env });
console.log("box id:", box.id);
console.log("bootstrapping engine...");
await box.exec.command(launch);

const { url: baseUrl } = await box.getPreviewUrl(ENGINE_PORT);
// The preview proxy strips the Authorization header, so authenticate via the
// engine's ?token= query param (auth.rs accepts it).
const health = `${baseUrl.replace(/\/$/, "")}/v1/health?token=${token}`;
console.log("preview:", baseUrl, "\npolling", health);

let ok = false;
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const res = await fetch(health);
    const body = await res.text();
    console.log(`[${i * 5}s] HTTP ${res.status} ${body.slice(0, 160)}`);
    if (res.ok) { ok = true; break; }
  } catch (e) {
    console.log(`[${i * 5}s] ${e?.message ?? e}`);
  }
}

if (process.env.KEEP === "1") {
  console.log("\nKEEP=1 — box left up:", box.id, baseUrl, "token:", token);
} else {
  await box.delete();
  console.log("box deleted.");
}
console.log(ok ? "\n✅ ENGINE IS SERVING (health 200)" : "\n❌ engine did not come up");
process.exit(ok ? 0 : 1);
