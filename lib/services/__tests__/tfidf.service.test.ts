import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/pattern.repository", () => ({
  patternRepository: {
    getAllPatterns: vi.fn(),
    assignPatternToCluster: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/cluster.repository", () => ({
  clusterRepository: {
    upsertTermDf: vi.fn(),
    getTermDfs: vi.fn(),
    findClusters: vi.fn(),
    createCluster: vi.fn(),
    updateClusterCentroid: vi.fn(),
  },
}));

import { tfidfService } from "@/lib/services/tfidf.service";
import { clusterRepository } from "@/lib/repositories/cluster.repository";
import { patternRepository } from "@/lib/repositories/pattern.repository";

describe("tfidfService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates DF counters for each term", async () => {
    await tfidfService.updateTermDf("user-1", ["groceri", "milk"]);

    expect(clusterRepository.upsertTermDf).toHaveBeenCalledWith("user-1", "groceri");
    expect(clusterRepository.upsertTermDf).toHaveBeenCalledWith("user-1", "milk");
  });

  it("computes TF-IDF vector for a pattern", async () => {
    (clusterRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 3 },
      { id: "2", userId: "user-1", term: "milk", df: 1 },
      { id: "3", userId: "user-1", term: "cook", df: 5 },
    ]);
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(
      Array(10).fill(null).map((_, i) => ({ id: `p-${i}` }))
    );

    const vector = await tfidfService.computeTfIdf("user-1", ["groceri", "milk"]);

    expect(vector).toHaveProperty("groceri");
    expect(vector).toHaveProperty("milk");
    expect(vector.groceri).toBeLessThan(vector.milk);
  });

  it("assigns to existing cluster when similarity exceeds threshold", async () => {
    (clusterRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { groceri: 0.5, milk: 0.3 }, memberCount: 2 },
    ]);
    (clusterRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 2 },
      { id: "2", userId: "user-1", term: "milk", df: 1 },
    ]);
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(Array(5).fill({ id: "p" }));
    (clusterRepository.updateClusterCentroid as Mock).mockResolvedValue({});

    const clusterId = await tfidfService.assignToCluster("user-1", "pat-1", ["groceri", "milk"]);

    expect(clusterId).toBe("cl-1");
    expect(patternRepository.assignPatternToCluster).toHaveBeenCalledWith("pat-1", "cl-1");
  });

  it("creates new cluster when no match exceeds threshold", async () => {
    (clusterRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { cook: 0.5 }, memberCount: 1 },
    ]);
    (clusterRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 1 },
    ]);
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(Array(5).fill({ id: "p" }));
    (clusterRepository.createCluster as Mock).mockResolvedValue({ id: "cl-2" });

    const clusterId = await tfidfService.assignToCluster("user-1", "pat-1", ["groceri"]);

    expect(clusterId).toBe("cl-2");
    expect(clusterRepository.createCluster).toHaveBeenCalled();
    expect(patternRepository.assignPatternToCluster).toHaveBeenCalledWith("pat-1", "cl-2");
  });
});
