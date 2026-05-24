import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
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
import { predictionRepository } from "@/lib/repositories/prediction.repository";

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
    (predictionRepository.findPatternById as Mock).mockResolvedValue(mockPattern);
    (predictionRepository.findPatternsByCluster as Mock).mockResolvedValue([
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
    (predictionRepository.findPatternById as Mock).mockResolvedValue(null);

    const results = await predictionService.predict("user-1", {});

    expect(results).toEqual([]);
  });
});
