import { beforeEach, describe, expect, it } from "vitest";
import {
  type ControlPlane,
  destroyForUser,
  type EngineSecrets,
  provisionOrGet,
} from "@/control-plane";
import { MockSandboxProvider } from "@/sandbox/mock";
import { InMemoryBoxStore } from "@/store/memory";

const SECRETS: EngineSecrets = {
  anthropicApiKey: "sk-ant",
  supabaseUrl: "https://x.supabase.co",
  supabaseServiceRoleKey: "service-role",
};

describe("provisionOrGet", () => {
  let cp: ControlPlane;
  let provider: MockSandboxProvider;

  beforeEach(() => {
    provider = new MockSandboxProvider();
    cp = { provider, store: new InMemoryBoxStore(), secrets: SECRETS };
  });

  it("provisions a box on first call", async () => {
    const handle = await provisionOrGet(cp, "user-1");
    expect(handle.provider).toBe("mock");
    expect(provider.provisionCount).toBe(1);
    // engine secrets reached the box
    const box = provider.boxes.get(handle.id);
    expect(box?.request.supabaseServiceRoleKey).toBe("service-role");
    expect(box?.request.userId).toBe("user-1");
  });

  it("reuses the stored box on repeat calls (one box per user)", async () => {
    const first = await provisionOrGet(cp, "user-1");
    const second = await provisionOrGet(cp, "user-1");
    expect(second).toEqual(first);
    expect(provider.provisionCount).toBe(1);
  });

  it("provisions a distinct box per user", async () => {
    const a = await provisionOrGet(cp, "user-a");
    const b = await provisionOrGet(cp, "user-b");
    expect(a.id).not.toBe(b.id);
    expect(provider.provisionCount).toBe(2);
  });
});

describe("destroyForUser", () => {
  it("destroys the box and forgets the mapping", async () => {
    const provider = new MockSandboxProvider();
    const store = new InMemoryBoxStore();
    const cp: ControlPlane = { provider, store, secrets: SECRETS };

    const handle = await provisionOrGet(cp, "user-1");
    expect(provider.boxes.has(handle.id)).toBe(true);

    await destroyForUser(cp, "user-1");
    expect(provider.boxes.has(handle.id)).toBe(false);
    expect(await store.getByUser("user-1")).toBeNull();

    // A subsequent get re-provisions a fresh box.
    const fresh = await provisionOrGet(cp, "user-1");
    expect(fresh.id).not.toBe(handle.id);
  });

  it("is a no-op when the user has no box", async () => {
    const cp: ControlPlane = {
      provider: new MockSandboxProvider(),
      store: new InMemoryBoxStore(),
      secrets: SECRETS,
    };
    await expect(destroyForUser(cp, "ghost")).resolves.toBeUndefined();
  });
});
