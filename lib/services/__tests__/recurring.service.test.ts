import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    getAllPatterns: vi.fn(),
  },
}));

import { recurringService } from "@/lib/services/recurring.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("recurringService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns patterns with frequency >= 3 as recurring candidates", async () => {
    const patterns = [
      { id: "pat-1", userId: "user-1", titleHash: "a", rawTitle: "team standup", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-2", userId: "user-1", titleHash: "b", rawTitle: "buy milk", frequency: 2, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-3", userId: "user-1", titleHash: "c", rawTitle: "weekly report", frequency: 8, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(patterns);

    const result = await recurringService.detectRecurring("user-1");

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("weekly report");
    expect(result[1].title).toBe("team standup");
  });

  it("returns empty array when no patterns have enough frequency", async () => {
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue([
      { id: "pat-1", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const result = await recurringService.detectRecurring("user-1");

    expect(result).toHaveLength(0);
  });
});
