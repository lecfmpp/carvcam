import { describe, expect, it } from "vitest";
import { migrateStorageKeys, RENAMED_STORAGE_KEYS } from "./storageKeys";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  failSet = false;
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failSet) throw new Error("QuotaExceededError");
    this.m.set(k, v);
  }
}

describe("migrateStorageKeys", () => {
  it("moves every old key to its new name and removes the old one", () => {
    const s = new MemoryStorage();
    s.setItem("gsender-design", '{"state":{"projects":[1]},"version":3}');
    s.setItem("gsender-workshop", '{"state":{"machine":"x"}}');
    s.setItem("gsender-anthropic-key", "sk-ant-123");
    migrateStorageKeys(s);
    expect(s.getItem("carvcam-design")).toBe('{"state":{"projects":[1]},"version":3}');
    expect(s.getItem("carvcam-workshop")).toBe('{"state":{"machine":"x"}}');
    expect(s.getItem("carvcam-anthropic-key")).toBe("sk-ant-123");
    for (const [from] of RENAMED_STORAGE_KEYS) expect(s.getItem(from)).toBeNull();
  });

  it("keeps data already saved under the new name", () => {
    const s = new MemoryStorage();
    s.setItem("gsender-design", "old");
    s.setItem("carvcam-design", "new");
    migrateStorageKeys(s);
    expect(s.getItem("carvcam-design")).toBe("new");
    expect(s.getItem("gsender-design")).toBeNull();
  });

  it("does nothing when there is nothing to move, and is safe to run twice", () => {
    const s = new MemoryStorage();
    s.setItem("carvcam-canvas", "x");
    migrateStorageKeys(s);
    migrateStorageKeys(s);
    expect(s.length).toBe(1);
  });

  it("keeps the old entry when the new one can't be written", () => {
    const s = new MemoryStorage();
    s.setItem("gsender-workshop", "w");
    s.failSet = true;
    expect(() => migrateStorageKeys(s)).not.toThrow();
    expect(s.getItem("gsender-workshop")).toBe("w");
    expect(s.getItem("carvcam-workshop")).toBeNull();
  });

  it("tolerates a missing storage", () => {
    expect(() => migrateStorageKeys(undefined)).not.toThrow();
  });
});
