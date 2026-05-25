import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/pattern.repository", () => ({
  patternRepository: {
    upsertPattern: vi.fn(),
  },
}));

import { patternService } from "@/lib/services/pattern.service";

describe("patternService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes a title", () => {
    const result = patternService.normalizeTitle("Buy Groceries 🥬!!");
    expect(result.hash).toBeDefined();
    expect(result.terms).toEqual(expect.arrayContaining(["groceries"]));
    expect(result.stemmedTerms).toEqual(expect.arrayContaining(["groceri"]));
    expect(result.terms).not.toContain("buy");
  });

  it("removes stop words and stems terms", () => {
    const result = patternService.normalizeTitle("buy groceries and milk");
    expect(result.terms).not.toContain("buy");
    expect(result.terms).not.toContain("and");
    expect(result.terms).toEqual(expect.arrayContaining(["groceries", "milk"]));
  });

  it("generates a consistent hash for same title", () => {
    const a = patternService.normalizeTitle("Buy groceries");
    const b = patternService.normalizeTitle("buy groceries");
    expect(a.hash).toBe(b.hash);
  });

  it("generates different hashes for different titles", () => {
    const a = patternService.normalizeTitle("buy groceries");
    const b = patternService.normalizeTitle("buy milk");
    expect(a.hash).not.toBe(b.hash);
  });

  it("handles empty title gracefully", () => {
    const result = patternService.normalizeTitle("");
    expect(result.hash).toBeDefined();
    expect(result.terms).toEqual([]);
  });

  it("upserts pattern via repository", async () => {
    const mockPattern = { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() };
    const { patternRepository } = await import("@/lib/repositories/pattern.repository");
    (patternRepository.upsertPattern as Mock).mockResolvedValue(mockPattern);

    const result = await patternService.upsertPattern("user-1", "buy groceries");

    expect(patternRepository.upsertPattern).toHaveBeenCalled();
    expect(result).toEqual(mockPattern);
  });
});
