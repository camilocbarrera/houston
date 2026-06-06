// End-to-end check of the body-agentPath fix on a FRESH box (patched binary).
// Provisions a box the way the provider does, creates a workspace+agent, starts
// a turn via POST /v1/agents/_/sessions with agentPath in the BODY, then reads
// the resulting events from Supabase and asserts agent_path === the real folder.
//   cd cloud && node --env-file=.env.local scripts/verify-fix.mjs
import { randomUUID } from "node:crypto";
import { Box } from "@upstash/box";

const PORT = 7777;
const WS = "/workspace/home/.houston";
const url = process.env.HOUSTON_ENGINE_BINARY_URL;
if (!url) throw new Error("HOUSTON_ENGINE_BINARY_URL not set");

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const token = "verify-" + Math.random().toString(36).slice(2);

// houston_events.user_id is a FK to auth.users — a random UUID would be
// rejected and no events would persist. Create a throwaway real auth user.
const admin = { apikey: KEY, authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const testEmail = `verify-${Math.random().toString(36).slice(2)}@example.com`;
const userRes = await fetch(`${SUPA}/auth/v1/admin/users`, {
  method: "POST",
  headers: admin,
  body: JSON.stringify({ email: testEmail, email_confirm: true, password: randomUUID() }),
});
const userJson = await userRes.json();
const userId = userJson.id;
if (!userId) throw new Error("could not create test auth user: " + JSON.stringify(userJson));

const env = {
  HOUSTON_BIND: `0.0.0.0:${PORT}`,
  HOUSTON_BIND_ALL: "1",
  HOUSTON_NO_PARENT_WATCHDOG: "1",
  HOUSTON_HOME: WS,
  HOUSTON_DOCS: `${WS}/workspaces`,
  HOUSTON_ENGINE_TOKEN: token,
  HOUSTON_CLOUD_USER_ID: userId,
  SUPABASE_URL: SUPA,
  SUPABASE_SERVICE_ROLE_KEY: KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

const bin = "$HOME/.local/bin/houston-engine";
const launch = `bash -lc 'set -e; mkdir -p "$HOME/.local/bin" "${WS}"; [ -x "${bin}" ] || { curl -fsSL "${url}" -o "${bin}" && chmod +x "${bin}"; }; cd "$HOME"; setsid "${bin}" >"${WS}/engine.log" 2>&1 </dev/null & echo launched'`;

const api = async (base, method, path, body) => {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${base}/v1${path}${sep}token=${token}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

console.log("creating box (patched binary)...");
const box = await Box.create({ runtime: "node", size: "medium", keepAlive: true, env });
console.log("box id:", box.id, "user:", userId);
await box.exec.command(launch);
const { url: baseRaw } = await box.getPreviewUrl(PORT);
const base = baseRaw.replace(/\/$/, "");

let up = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const h = await fetch(`${base}/v1/health?token=${token}`);
    if (h.ok) { up = true; break; }
  } catch {}
}
if (!up) { await box.delete(); throw new Error("engine never came up"); }
console.log("engine healthy");

const wsRow = await api(base, "POST", "/workspaces", { name: "Houston Cloud" });
const created = await api(base, "POST", `/workspaces/${encodeURIComponent(wsRow.id)}/agents`, {
  name: "Assistant",
  configId: "blank",
  claudeMd: "# Assistant\n",
});
const folderPath = created.agent.folderPath;
console.log("agent folderPath:", folderPath);

const sessionKey = `cloud-${created.agent.id}`;
// THE FIX: agentPath in body, sentinel "_" segment in the URL.
await api(base, "POST", "/agents/_/sessions", {
  agentPath: folderPath,
  sessionKey,
  prompt: "Reply with exactly: pong",
});
console.log("session started; waiting for events...");

let match = false;
let seen = [];
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 2500));
  const rows = await (
    await fetch(
      `${SUPA}/rest/v1/houston_events?select=payload&user_id=eq.${userId}&order=created_at.desc&limit=40`,
      { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } },
    )
  ).json();
  const mine = rows.map((r) => r.payload).filter((p) => p?.data?.session_key === sessionKey);
  seen = mine.map((p) => p?.data?.item?.feed_type).filter(Boolean);
  const ap = mine.find((p) => p?.data?.agent_path)?.data?.agent_path;
  if (ap) {
    console.log("event agent_path:", ap);
    console.log("MATCHES folderPath:", ap === folderPath);
    match = ap === folderPath;
    if (seen.includes("assistant_text") || seen.includes("final_result")) break;
  }
}
console.log("feed_types seen:", seen.join(", "));

// cleanup: box, the test user's events, then the throwaway user itself
await box.delete();
await fetch(`${SUPA}/rest/v1/houston_events?user_id=eq.${userId}`, {
  method: "DELETE",
  headers: { apikey: KEY, authorization: `Bearer ${KEY}`, Prefer: "return=minimal" },
});
await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: admin });
console.log(match ? "\n✅ FIX VERIFIED — agent_path matches, chat will render" : "\n❌ agent_path mismatch");
process.exit(match ? 0 : 1);
