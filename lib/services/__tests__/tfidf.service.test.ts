import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    upsertTermDf: vi.fn(),
    getTermDfs: vi.fn(),
    findClusters: vi.fn(),
    createCluster: vi.fn(),
    updateClusterCentroid: vi.fn(),
    assignPatternToCluster: vi.fn(),
    getAllPatterns: vi.fn(),
  },
}));

import { tfidfService } from "@/lib/services/tfidf.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("tfidfService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates DF counters for each term", async () => {
    await tfidfService.updateTermDf("user-1", ["groceri", "milk"]);

    expect(predictionRepository.upsertTermDf).toHaveBeenCalledWith("user-1", "groceri");
    expect(predictionRepository.upsertTermDf).toHaveBeenCalledWith("user-1", "milk");
  });

  it("computes TF-IDF vector for a pattern", async () => {
    (predictionRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 3 },
      { id: "2", userId: "user-1", term: "milk", df: 1 },
      { id: "3", userId: "user-1", term: "cook", df: 5 },
    ]);
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(
      Array(10).fill(null).map((_, i) => ({ id: `p-${i}` }))
    );

    const vector = await tfidfService.computeTfIdf("user-1", ["groceri", "milk"]);

    expect(vector).toHaveProperty("groceri");
    expect(vector).toHaveProperty("milk");
    expect(vector.groceri).toBeLessThan(vector.milk);
  });

  it("assigns to existing cluster when similarity exceeds threshold", async () => {
    (predictionRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { groceri: 0.5, milk: 0.3 }, memberCount: 2 },
    ]);
    (predictionRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 2 },
      { id: "2", userId: "user-1", term: "milk", df: 1 },
    ]);
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(Array(5).fill({ id: "p" }));
    (predictionRepository.updateClusterCentroid as Mock).mockResolvedValue({});

    const clusterId = await tfidfService.assignToCluster("user-1", "pat-1", ["groceri", "milk"]);

    expect(clusterId).toBe("cl-1");
    expect(predictionRepository.assignPatternToCluster).toHaveBeenCalledWith("pat-1", "cl-1");
  });

  it("creates new cluster when no match exceeds threshold", async () => {
    (predictionRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { cook: 0.5 }, memberCount: 1 },
    ]);
    (predictionRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 1 },
    ]);
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(Array(5).fill({ id: "p" }));
    (predictionRepository.createCluster as Mock).mockResolvedValue({ id: "cl-2" });

    const clusterId = await tfidfService.assignToCluster("user-1", "pat-1", ["groceri"]);

    expect(clusterId).toBe("cl-2");
    expect(predictionRepository.createCluster).toHaveBeenCalled();
    expect(predictionRepository.assignPatternToCluster).toHaveBeenCalledWith("pat-1", "cl-2");
  });
});
