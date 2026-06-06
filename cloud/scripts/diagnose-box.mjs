// Reconnect to an existing box and diagnose why the engine isn't serving.
//   cd cloud && BOX_ID=<id> node --env-file=.env.local scripts/diagnose-box.mjs
import { Box } from "@upstash/box";

const id = process.env.BOX_ID;
if (!id) throw new Error("set BOX_ID");
const box = await Box.get(id);

const run = async (cmd) => {
  try {
    const r = await box.exec.command(cmd);
    console.log(`\n$ ${cmd}\n${r._result ?? JSON.stringify(r)}`);
  } catch (e) {
    console.log(`\n$ ${cmd}\n  ERR ${e?.message ?? e}`);
  }
};

await run("ls -la $HOME/.local/bin/ 2>&1");
await run("file $HOME/.local/bin/houston-engine 2>&1 | head -1");
await run("ps aux | grep -i houston | grep -v grep | head");
await run("ss -ltn 2>/dev/null | head || netstat -ltn 2>/dev/null | head");
try {
  console.log("\n=== init command ===\n", await box.getInitCommand());
} catch (e) {
  console.log("getInitCommand err:", e?.message ?? e);
}

// Run the engine by hand for ~18s and capture stdout+stderr.
const WS = "/workspace/home/.houston";
const envline =
  `HOUSTON_BIND=0.0.0.0:7777 HOUSTON_BIND_ALL=1 HOUSTON_NO_PARENT_WATCHDOG=1 ` +
  `HOUSTON_HOME=${WS} HOUSTON_DOCS=${WS}/workspaces HOUSTON_ENGINE_TOKEN=t ` +
  `HOUSTON_CLOUD_USER_ID=diag`;
await run(`bash -lc 'cd $HOME && timeout 18 env ${envline} $HOME/.local/bin/houston-engine 2>&1 | head -40; echo EXIT=$?'`);

console.log("\ndone (box left running).");
