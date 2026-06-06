// On an existing box: download the engine, start it DETACHED via exec, and
// check it listens. Validates the exec-based bootstrap (initCommand doesn't run
// on fresh keepAlive boxes).
//   cd cloud && BOX_ID=<id> node --env-file=.env.local scripts/fix-test-box.mjs
import { Box } from "@upstash/box";

const id = process.env.BOX_ID;
if (!id) throw new Error("set BOX_ID");
const box = await Box.get(id);
const url = process.env.HOUSTON_ENGINE_BINARY_URL;
const WS = "/workspace/home/.houston";

const run = async (cmd, label) => {
  const r = await box.exec.command(cmd);
  console.log(`\n[${label}] exit=${r._exitCode}\n${(r._result ?? "").slice(0, 1500)}`);
  return r;
};

await run(
  `bash -lc 'mkdir -p "$HOME/.local/bin" "${WS}"; curl -fsSL "${url}" -o "$HOME/.local/bin/houston-engine" && chmod +x "$HOME/.local/bin/houston-engine" && file "$HOME/.local/bin/houston-engine"'`,
  "download",
);

const env =
  `HOUSTON_BIND=0.0.0.0:7777 HOUSTON_BIND_ALL=1 HOUSTON_NO_PARENT_WATCHDOG=1 ` +
  `HOUSTON_HOME=${WS} HOUSTON_DOCS=${WS}/workspaces HOUSTON_ENGINE_TOKEN=t HOUSTON_CLOUD_USER_ID=diag`;
await run(
  `bash -lc 'cd $HOME; setsid env ${env} $HOME/.local/bin/houston-engine >${WS}/engine.log 2>&1 </dev/null & echo launched pid=$!'`,
  "launch",
);

await new Promise((r) => setTimeout(r, 10000));
await run(`bash -lc 'tail -30 ${WS}/engine.log 2>&1'`, "engine.log");
await run(`bash -lc 'ss -ltn 2>/dev/null | grep 7777 || echo "nothing on 7777"'`, "listening");
await run(
  `bash -lc 'curl -s -m 5 -o /dev/null -w "localhost health HTTP %{http_code}" http://localhost:7777/v1/health'`,
  "local-health",
);
console.log("\ndone.");
