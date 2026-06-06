import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNamedAgent, ensureWorkspaceAgent } from "./bootstrap";
import type { Agent, EngineTarget, Workspace } from "./engine";

// Mock the engine REST layer so bootstrap's logic is tested in isolation.
vi.mock("./engine", () => ({
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  listAgents: vi.fn(),
  createAgent: vi.fn(),
  startAgentWatcher: vi.fn(async () => undefined),
}));

import * as engine from "./engine";

const TARGET: EngineTarget = { baseUrl: "https://box", token: "t" };
const ws: Workspace = { id: "w1", name: "Houston Cloud", isDefault: false, createdAt: "" };
const agent: Agent = { id: "a1", name: "Assistant", folderPath: "/p", configId: "blank", createdAt: "" };

const mocked = vi.mocked(engine);

beforeEach(() => vi.clearAllMocks());

describe("ensureWorkspaceAgent", () => {
  it("creates the workspace + a default agent on an empty engine", async () => {
    mocked.listWorkspaces.mockResolvedValue([]);
    mocked.createWorkspace.mockResolvedValue(ws);
    mocked.listAgents.mockResolvedValueOnce([]).mockResolvedValueOnce([agent]);
    mocked.createAgent.mockResolvedValue(agent);

    const result = await ensureWorkspaceAgent(TARGET);

    expect(mocked.createWorkspace).toHaveBeenCalledWith(TARGET, "Houston Cloud");
    expect(mocked.createAgent).toHaveBeenCalledOnce();
    expect(mocked.startAgentWatcher).toHaveBeenCalledWith(TARGET, "/p");
    expect(result).toEqual({ workspaceId: "w1", agents: [agent] });
  });

  it("is idempotent — reuses an existing workspace + agents (no creates)", async () => {
    mocked.listWorkspaces.mockResolvedValue([ws]);
    mocked.listAgents.mockResolvedValue([agent]);

    const result = await ensureWorkspaceAgent(TARGET);

    expect(mocked.createWorkspace).not.toHaveBeenCalled();
    expect(mocked.createAgent).not.toHaveBeenCalled();
    expect(result.workspaceId).toBe("w1");
    expect(result.agents).toEqual([agent]);
  });
});

describe("createNamedAgent", () => {
  it("creates a blank agent with the given name in the workspace", async () => {
    const second: Agent = { ...agent, id: "a2", name: "Researcher", folderPath: "/p2" };
    mocked.createAgent.mockResolvedValue(second);

    const created = await createNamedAgent(TARGET, "w1", "Researcher");

    expect(mocked.createAgent).toHaveBeenCalledWith(
      TARGET,
      "w1",
      expect.objectContaining({ name: "Researcher", configId: "blank" }),
    );
    expect(created).toEqual(second);
  });
});
