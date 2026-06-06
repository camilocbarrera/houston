import { describe, expect, it } from "vitest";
import { MockSandboxProvider } from "@/sandbox/mock";
import { makeSandboxProvider, sandboxProviderFromEnv } from "@/sandbox/registry";
import { UpstashBoxProvider } from "@/sandbox/upstash-box";

describe("sandbox registry", () => {
  it("builds the upstash provider by name", () => {
    expect(makeSandboxProvider("upstash")).toBeInstanceOf(UpstashBoxProvider);
  });

  it("builds the mock provider by name", () => {
    expect(makeSandboxProvider("mock")).toBeInstanceOf(MockSandboxProvider);
  });

  it("throws on an unknown provider rather than falling back", () => {
    expect(() => makeSandboxProvider("railway")).toThrow(/Unknown SANDBOX_PROVIDER/);
  });

  it("defaults to upstash when env is unset", () => {
    expect(sandboxProviderFromEnv({})).toBeInstanceOf(UpstashBoxProvider);
  });

  it("honors SANDBOX_PROVIDER from env", () => {
    expect(sandboxProviderFromEnv({ SANDBOX_PROVIDER: "mock" })).toBeInstanceOf(
      MockSandboxProvider,
    );
  });
});
