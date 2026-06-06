//! In-memory sandbox provider.
//!
//! Powers the unit tests AND a fully offline demo / local dev run (set
//! `SANDBOX_PROVIDER=mock`). It fakes the box lifecycle in a Map so the control
//! plane, store, and clients can be exercised end-to-end without an Upstash
//! account or a real engine box.

import {
  type ProvisionRequest,
  type SandboxHandle,
  type SandboxProvider,
  type SandboxStatus,
} from "@/sandbox/types";

interface MockBox {
  handle: SandboxHandle;
  status: SandboxStatus;
  request: ProvisionRequest;
}

export class MockSandboxProvider implements SandboxProvider {
  readonly name = "mock";

  /** Provisioned boxes by id — inspectable in tests. */
  readonly boxes = new Map<string, MockBox>();

  /** How many times `provision` was called — lets tests assert reuse. */
  provisionCount = 0;

  /** Base host for the fake public URL. */
  constructor(private readonly host = "https://mock.box.local") {}

  async provision(req: ProvisionRequest): Promise<SandboxHandle> {
    this.provisionCount += 1;
    const id = `mock-${this.provisionCount}-${req.userId}`;
    const handle: SandboxHandle = {
      id,
      baseUrl: `${this.host}/${id}`,
      token: `tok-${id}`,
      provider: this.name,
    };
    this.boxes.set(id, { handle, status: "running", request: req });
    return handle;
  }

  async status(id: string): Promise<SandboxStatus> {
    return this.boxes.get(id)?.status ?? "unknown";
  }

  async wake(id: string): Promise<void> {
    const box = this.require(id);
    box.status = "running";
  }

  async destroy(id: string): Promise<void> {
    this.require(id);
    this.boxes.delete(id);
  }

  /** Test helper: force a box into a given state. */
  setStatus(id: string, status: SandboxStatus): void {
    this.require(id).status = status;
  }

  private require(id: string): MockBox {
    const box = this.boxes.get(id);
    if (!box) throw new Error(`mock box not found: ${id}`);
    return box;
  }
}
