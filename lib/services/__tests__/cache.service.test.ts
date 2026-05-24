import { vi } from "vitest";
import { CacheService } from "../cache.service";

describe("CacheService", () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  it("returns null for missing key", () => {
    expect(cache.get("todos")).toBeNull();
  });

  it("stores and retrieves value", () => {
    cache.set("todos", [{ id: "1", title: "test" }]);
    expect(cache.get("todos")).toEqual([{ id: "1", title: "test" }]);
  });

  it("invalidates specific key", () => {
    cache.set("todos", []);
    cache.set("audit", []);
    cache.invalidate("todos");
    expect(cache.get("todos")).toBeNull();
    expect(cache.get("audit")).toEqual([]);
  });

  it("clears all cache", () => {
    cache.set("todos", []);
    cache.set("audit", []);
    cache.clear();
    expect(cache.get("todos")).toBeNull();
    expect(cache.get("audit")).toBeNull();
  });
});
