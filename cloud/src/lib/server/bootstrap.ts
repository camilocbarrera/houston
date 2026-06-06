//! First-run setup for a freshly-provisioned box: ensure a "Houston Cloud"
//! workspace and at least one agent exist. Idempotent — safe to call on every
//! request; existing workspace/agents are reused.
//!
//! Mirrors `examples/smartbooks/src/lib/bootstrap.ts`, adapted to the
//! server-side engine client (the engine boots with an empty `~/.houston`, so
//! the very first request has to create the workspace + agent).

import {
  type Agent,
  type EngineTarget,
  createAgent,
  createWorkspace,
  listAgents,
  listWorkspaces,
  startAgentWatcher,
} from "./engine";

const WORKSPACE_NAME = "Houston Cloud";
const DEFAULT_AGENT_NAME = "Assistant";

const DEFAULT_CLAUDE_MD = `# Assistant

You are a helpful Houston agent running in the cloud. Be concise and friendly.
`;

export interface AgentBootstrap {
  workspaceId: string;
  agents: Agent[];
}

/** Ensure the cloud workspace exists with at least one agent; return both. */
export async function ensureWorkspaceAgent(target: EngineTarget): Promise<AgentBootstrap> {
  const workspaces = await listWorkspaces(target);
  const workspace =
    workspaces.find((w) => w.name === WORKSPACE_NAME) ??
    (await createWorkspace(target, WORKSPACE_NAME));

  let agents = await listAgents(target, workspace.id);
  if (agents.length === 0) {
    await createAgent(target, workspace.id, {
      name: DEFAULT_AGENT_NAME,
      configId: "blank",
      claudeMd: DEFAULT_CLAUDE_MD,
    });
    agents = await listAgents(target, workspace.id);
  }

  // Start the watcher on the first agent so agent-side file writes surface as
  // events (the engine holds one watcher per process).
  await startAgentWatcher(target, agents[0].folderPath);

  return { workspaceId: workspace.id, agents };
}

/** Create an additional named agent in the cloud workspace (multi-agent). */
export async function createNamedAgent(
  target: EngineTarget,
  workspaceId: string,
  name: string,
): Promise<Agent> {
  return createAgent(target, workspaceId, {
    name,
    configId: "blank",
    claudeMd: `# ${name}\n\nYou are a helpful Houston agent running in the cloud.\n`,
  });
}
