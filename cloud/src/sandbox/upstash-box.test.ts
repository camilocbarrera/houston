import { describe, expect, it, vi } from "vitest";
import { type ProvisionRequest } from "@/sandbox/types";
import {
  engineBootSpec,
  mapStatus,
  type UpstashBoxInstance,
  type UpstashBoxSdk,
  UpstashBoxProvider,
} from "@/sandbox/upstash-box";

const REQ: ProvisionRequest = {
  userId: "user-1",
  anthropicApiKey: "sk-ant-test",
  supabaseUrl: "https://x.supabase.co",
  supabaseServiceRoleKey: "service-role",
};

/** Build a fake box instance with spy-able lifecycle methods. */
function fakeBox(overrides: Partial<UpstashBoxInstance> = {}): UpstashBoxInstance {
  return {
    id: "box-abc",
    exec: { command: vi.fn(async () => ({ _exitCode: 0 })) },
    getPreviewUrl: vi.fn(async () => ({
      url: "https://box-abc-7777.preview.box.upstash.com/",
    })),
    getStatus: vi.fn(async () => ({ status: "running" })),
    resume: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Fake SDK: create returns a box; get looks it up by id. */
function fakeSdk(box: UpstashBoxInstance): {
  sdk: UpstashBoxSdk;
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(async () => box);
  const get = vi.fn(async () => box);
  return { sdk: { create, get }, create, get };
}

describe("engineBootSpec", () => {
  it("stamps every env the in-box engine + cloud sink need", () => {
    const { env } = engineBootSpec(REQ, "tok-123", "https://cdn/engine");
    expect(env.HOUSTON_ENGINE_TOKEN).toBe("tok-123");
    expect(env.HOUSTON_CLOUD_USER_ID).toBe("user-1");
    expect(env.SUPABASE_URL).toBe("https://x.supabase.co");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(env.HOUSTON_BIND).toBe("0.0.0.0:7777");
    expect(env.HOUSTON_BIND_ALL).toBe("1");
    expect(env.HOUSTON_HOME).toContain("/workspace");
  });

  it("downloads the binary then launches it detached", () => {
    const { launchCommand } = engineBootSpec(REQ, "t", "https://cdn/engine-arm64");
    expect(launchCommand).toContain("https://cdn/engine-arm64");
    expect(launchCommand).toContain("chmod +x");
    expect(launchCommand).toContain("setsid");
  });
});

describe("mapStatus", () => {
  it("maps Upstash status strings to coarse lifecycle states", () => {
    expect(mapStatus("running")).toBe("running");
    expect(mapStatus("READY")).toBe("running");
    expect(mapStatus("paused")).toBe("frozen");
    expect(mapStatus("idle")).toBe("frozen");
    expect(mapStatus("stopped")).toBe("stopped");
    expect(mapStatus("deleted")).toBe("stopped");
    expect(mapStatus("weird")).toBe("unknown");
  });
});

describe("UpstashBoxProvider.provision", () => {
  it("creates a keepAlive box, exposes :7777, returns a handle", async () => {
    const box = fakeBox();
    const { sdk, create } = fakeSdk(box);
    const provider = new UpstashBoxProvider({
      sdk,
      generateToken: () => "fixed-token",
      engineBinaryUrl: "https://cdn/engine-arm64",
    });

    const handle = await provider.provision(REQ);

    expect(create).toHaveBeenCalledOnce();
    const createArg = create.mock.calls[0][0];
    expect(createArg.keepAlive).toBe(true);
    expect(createArg.runtime).toBe("node");
    expect(createArg.env.HOUSTON_ENGINE_TOKEN).toBe("fixed-token");
    // engine bootstrapped via exec (not initCommand)
    expect(box.exec.command).toHaveBeenCalledOnce();
    expect((box.exec.command as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      "setsid",
    );
    expect(box.getPreviewUrl).toHaveBeenCalledWith(7777);

    expect(handle).toEqual({
      id: "box-abc",
      baseUrl: "https://box-abc-7777.preview.box.upstash.com", // trailing slash stripped
      token: "fixed-token",
      provider: "upstash",
    });
  });

  it("fails loud when no engine binary URL is configured", async () => {
    const { sdk } = fakeSdk(fakeBox());
    const provider = new UpstashBoxProvider({ sdk, engineBinaryUrl: "" });
    await expect(provider.provision(REQ)).rejects.toThrow(/engine binary URL/);
  });
});

describe("UpstashBoxProvider lifecycle by id", () => {
  it("status() reconnects by id and maps the state", async () => {
    const box = fakeBox({ getStatus: vi.fn(async () => ({ status: "paused" })) });
    const { sdk, get } = fakeSdk(box);
    const provider = new UpstashBoxProvider({ sdk });

    expect(await provider.status("box-abc")).toBe("frozen");
    expect(get).toHaveBeenCalledWith("box-abc");
  });

  it("wake() reconnects and resumes", async () => {
    const box = fakeBox();
    const { sdk, get } = fakeSdk(box);
    const provider = new UpstashBoxProvider({ sdk });

    await provider.wake("box-abc");
    expect(get).toHaveBeenCalledWith("box-abc");
    expect(box.resume).toHaveBeenCalledOnce();
  });

  it("destroy() reconnects and deletes", async () => {
    const box = fakeBox();
    const { sdk, get } = fakeSdk(box);
    const provider = new UpstashBoxProvider({ sdk });

    await provider.destroy("box-abc");
    expect(get).toHaveBeenCalledWith("box-abc");
    expect(box.delete).toHaveBeenCalledOnce();
  });
});
