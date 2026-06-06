//! In-memory box store — tests and offline demo.

import { type SandboxHandle } from "@/sandbox/types";
import { type BoxStore } from "@/store/types";

export class InMemoryBoxStore implements BoxStore {
  private readonly byUser = new Map<string, SandboxHandle>();

  async getByUser(userId: string): Promise<SandboxHandle | null> {
    return this.byUser.get(userId) ?? null;
  }

  async save(userId: string, handle: SandboxHandle): Promise<void> {
    this.byUser.set(userId, handle);
  }

  async remove(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}
