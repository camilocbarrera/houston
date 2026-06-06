// One-off: probe an Upstash Box environment so we can design the engine
// bootstrap. Creates a box, inspects it, deletes it.
//
//   cd cloud && node --env-file=.env.local scripts/probe-box.mjs
import { Box } from "@upstash/box";

const box = await Box.create({ runtime: "node", size: "small" });
console.log("box id:", box.id);

const cmds = [
  "uname -a",
  "cat /etc/os-release | head -2",
  "echo PATH=$PATH",
  "which node npm claude codex git bash curl 2>&1",
  "node -v 2>&1",
  "claude --version 2>&1 | head -1",
  "id",
  "curl -fsSLI https://github.com 2>&1 | head -1",
  "nproc; free -h 2>/dev/null | head -2",
];

for (const cmd of cmds) {
  try {
    const r = await box.exec.command(cmd);
    console.log(`\n$ ${cmd}\n`, JSON.stringify(r));
  } catch (e) {
    console.log(`\n$ ${cmd}\n  ERROR`, e?.message ?? e);
  }
}

await box.delete();
console.log("\nbox deleted.");
