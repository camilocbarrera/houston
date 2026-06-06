// Measure how the Upstash preview proxy + engine resolve an agent path under
// different URL encodings. Run: node --env-file=.env.local scripts/probe-encoding.mjs
const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
const k = process.env.SUPABASE_SERVICE_ROLE_KEY;

const boxRes = await fetch(
  `${u}/rest/v1/houston_boxes?select=base_url,token&limit=1`,
  { headers: { apikey: k, authorization: `Bearer ${k}` } },
);
const [{ base_url, token }] = await boxRes.json();
const base = base_url.replace(/\/$/, "");
const target = "/workspace/home/.houston/workspaces/Houston Cloud/Financial Agent";

const enc1 = encodeURIComponent(target);
const enc2 = encodeURIComponent(enc1);
// slash-only single encode (spaces left raw), and a catch-all-style raw path
const slashOnly = target.replaceAll("/", "%2F");
const cands = { single: enc1, double: enc2, slashOnly };

for (const [name, enc] of Object.entries(cands)) {
  const sk = `enc-${name}-${Math.random().toString(36).slice(2, 6)}`;
  let status;
  try {
    const res = await fetch(`${base}/v1/agents/${enc}/sessions?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey: sk, prompt: "ok" }),
    });
    status = res.status;
  } catch (e) {
    console.log(`[${name}] POST error:`, e.message);
    continue;
  }
  console.log(`[${name}] POST status:`, status);
  if (status < 200 || status >= 300) continue;
  await new Promise((r) => setTimeout(r, 2500));
  const rows = await (
    await fetch(
      `${u}/rest/v1/houston_events?select=payload&order=created_at.desc&limit=80`,
      { headers: { apikey: k, authorization: `Bearer ${k}` } },
    )
  ).json();
  const mine = rows
    .map((x) => x.payload)
    .filter((p) => p?.data?.session_key === sk && p?.data?.agent_path);
  const ap = mine[0]?.data?.agent_path;
  console.log(`[${name}] resolved agent_path:`, ap);
  console.log(`[${name}] MATCHES target:`, ap === target);
}
