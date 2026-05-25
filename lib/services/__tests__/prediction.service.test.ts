import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/pattern.repository", () => ({
  patternRepository: {
    findPatternById: vi.fn(),
    findPatternsByCluster: vi.fn(),
  },
}));

vi.mock("@/lib/services/temporal.service", () => ({
  temporalService: {
    getTopForTimeSlot: vi.fn(),
  },
}));

vi.mock("@/lib/services/transition.service", () => ({
  transitionService: {
    getTopFollowUps: vi.fn(),
  },
}));

import { predictionService } from "@/lib/services/prediction.service";
import { temporalService } from "@/lib/services/temporal.service";
import { transitionService } from "@/lib/services/transition.service";
import { patternRepository } from "@/lib/repositories/pattern.repository";

describe("predictionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns blended predictions from all three signals", async () => {
    const mockPattern = { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() };

    (temporalService.getTopForTimeSlot as Mock).mockResolvedValue([
      { pattern: { ...mockPattern, id: "temporal-1", rawTitle: "temporal task" }, count: 3 },
    ]);
    (transitionService.getTopFollowUps as Mock).mockResolvedValue([
      { toPattern: { ...mockPattern, id: "seq-1", rawTitle: "sequential task" }, count: 2 },
    ]);
    (patternRepository.findPatternById as Mock).mockResolvedValue(mockPattern);
    (patternRepository.findPatternsByCluster as Mock).mockResolvedValue([
      { ...mockPattern, id: "sem-1", rawTitle: "semantic task" },
    ]);

    const results = await predictionService.predict("user-1", {
      currentPatternId: "pat-1",
      hour: 14,
      day: 1,
    });

    expect(results).toHaveLength(3);
    expect(results[0].reason).toMatch(/temporal|sequential|semantic/i);
    expect(results[0]).toHaveProperty("patternId");
    expect(results[0]).toHaveProperty("rawTitle");
    expect(results[0]).toHaveProperty("score");
    expect(results[0]).toHaveProperty("reason");
  });

  it("returns empty array when no data exists", async () => {
    (temporalService.getTopForTimeSlot as Mock).mockResolvedValue([]);
    (patternRepository.findPatternById as Mock).mockResolvedValue(null);

    const results = await predictionService.predict("user-1", {});

    expect(results).toEqual([]);
  });

  it("filters by minFrequency", async () => {
    (temporalService.getTopForTimeSlot as Mock).mockResolvedValue([
      { pattern: { id: "pat-1", userId: "user-1", titleHash: "a", rawTitle: "frequent task", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() }, count: 2 },
      { pattern: { id: "pat-2", userId: "user-1", titleHash: "b", rawTitle: "rare task", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() }, count: 1 },
    ]);
    (patternRepository.findPatternById as Mock).mockResolvedValue(null);

    const results = await predictionService.predict("user-1", { minFrequency: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("frequent task");
  });
});
