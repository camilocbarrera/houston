import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgent,
  createWorkspace,
  health,
  startSession,
  type EngineTarget,
} from "./engine";

const TARGET: EngineTarget = {
  // Trailing slash is intentional — `call` must strip it.
  baseUrl: "https://box.example.com/",
  token: "tok en", // space forces URL-encoding
};

function mockFetch(body: unknown, init: ResponseInit = { status: 200 }) {
  const fn = vi.fn(
    async (_url: string, _opts?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        ...init,
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("engine REST client", () => {
  it("authenticates via ?token= (not an Authorization header) and strips the trailing slash", async () => {
    const fn = mockFetch({ status: "ok", version: "0.4.19" });
    await health(TARGET);
    const [url, opts] = fn.mock.calls[0];
    expect(url).toBe("https://box.example.com/v1/health?token=tok%20en");
    // The preview proxy strips Authorization; we must NOT rely on it.
    expect(opts?.headers).toBeUndefined();
  });

  it("sends JSON bodies with a content-type on POST", async () => {
    const fn = mockFetch({ id: "w1", name: "Houston Cloud", isDefault: false, createdAt: "" });
    await createWorkspace(TARGET, "Houston Cloud");
    const [url, opts] = fn.mock.calls[0];
    expect(url).toContain("/v1/workspaces?token=");
    expect(opts?.method).toBe("POST");
    expect((opts?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts?.body as string)).toEqual({ name: "Houston Cloud" });
  });

  it("unwraps { agent } from createAgent", async () => {
    mockFetch({ agent: { id: "a1", name: "Assistant", folderPath: "/p", configId: "blank", createdAt: "" } });
    const agent = await createAgent(TARGET, "w1", { name: "Assistant", configId: "blank" });
    expect(agent.id).toBe("a1");
    expect(agent.folderPath).toBe("/p");
  });

  it("passes the agent path in the BODY to a sentinel segment (proxy decodes the URL path)", async () => {
    const fn = mockFetch({ sessionKey: "cloud-a1" });
    await startSession(TARGET, "Houston Cloud/Assistant", { sessionKey: "cloud-a1", prompt: "hi" });
    const [url, opts] = fn.mock.calls[0];
    // No agent path in the URL — just a sentinel segment the proxy can't corrupt.
    expect(url).toContain("/v1/agents/_/sessions?token=");
    expect(JSON.parse(opts?.body as string)).toEqual({
      sessionKey: "cloud-a1",
      prompt: "hi",
      agentPath: "Houston Cloud/Assistant",
    });
  });

  it("surfaces the engine's error message on a non-2xx response", async () => {
    mockFetch({ error: { code: "NOT_FOUND", message: "workspace gone" } }, { status: 404 });
    await expect(health(TARGET)).rejects.toThrow("workspace gone");
  });

  it("falls back to a status-coded message when the error body is unparsable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("502 Bad Gateway", { status: 502 })),
    );
    await expect(health(TARGET)).rejects.toThrow(/502/);
  });
});
