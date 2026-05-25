import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/pattern.repository", () => ({
  patternRepository: {
    findPatternById: vi.fn(),
    findPatternsByCluster: vi.fn(),
    findMostRecentPattern: vi.fn(),
    getAllPatterns: vi.fn(),
  },
}));

vi.mock("@/lib/services/temporal.service", () => ({
  temporalService: {
    getTopForTimeSlot: vi.fn(),
  },
}));

vi.mock("@/lib/services/pattern.service", () => ({
  patternService: {
    normalizeTitle: vi.fn((title: string) => {
      const cleaned = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const tokens = cleaned.split(/\s+/).filter(Boolean);
      const terms = Array.from(new Set(tokens));
      return { hash: terms.join(",") || cleaned, terms, stemmedTerms: Array.from(new Set(tokens)) };
    }),
  },
}));

vi.mock("@/lib/services/transition.service", () => ({
  transitionService: {
    getTopFollowUps: vi.fn(),
  },
}));

vi.mock("@/lib/services/tfidf.service", () => ({
  tfidfService: {
    computeTfIdf: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/cluster.repository", () => ({
  clusterRepository: {
    findClusters: vi.fn(),
  },
}));

import { predictionService } from "@/lib/services/prediction.service";
import { temporalService } from "@/lib/services/temporal.service";
import { transitionService } from "@/lib/services/transition.service";
import { patternRepository } from "@/lib/repositories/pattern.repository";
import { patternService } from "@/lib/services/pattern.service";
import { tfidfService } from "@/lib/services/tfidf.service";
import { clusterRepository } from "@/lib/repositories/cluster.repository";

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
    (patternRepository.findMostRecentPattern as Mock).mockResolvedValue(null);

    const results = await predictionService.predict("user-1", {});

    expect(results).toEqual([]);
  });

  it("filters by minFrequency", async () => {
    (temporalService.getTopForTimeSlot as Mock).mockResolvedValue([
      { pattern: { id: "pat-1", userId: "user-1", titleHash: "a", rawTitle: "frequent task", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() }, count: 2 },
      { pattern: { id: "pat-2", userId: "user-1", titleHash: "b", rawTitle: "rare task", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() }, count: 1 },
    ]);
    (patternRepository.findMostRecentPattern as Mock).mockResolvedValue(null);

    const results = await predictionService.predict("user-1", { minFrequency: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("frequent task");
  });

  it("returns matching predictions when query has substring overlap", async () => {
    const mockPatterns = [
      { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-eggs", userId: "user-1", titleHash: "c", rawTitle: "get eggs", frequency: 2, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);

    const results = await predictionService.predict("user-1", { query: "mil" });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("buy milk");
    expect(results[0].reason).toBe("query match");
  });

  it("returns matching predictions from token intersection across normalized terms", async () => {
    const mockPatterns = [
      { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);

    const results = await predictionService.predict("user-1", { query: "milk" });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("buy milk");
  });

  it("scores by overlap count times 2 plus frequency and returns top 6 sorted descending", async () => {
    const mockPatterns = [
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 10, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);

    const results = await predictionService.predict("user-1", { query: "buy" });

    expect(results).toHaveLength(2);
    expect(results[0].rawTitle).toBe("buy milk");
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("returns empty array when no patterns match the query", async () => {
    (patternRepository.getAllPatterns as Mock).mockResolvedValue([
      { id: "pat-bread", userId: "user-1", titleHash: "a", rawTitle: "buy bread", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const results = await predictionService.predict("user-1", { query: "zzzzz" });

    expect(results).toEqual([]);
  });

  it("falls back to blended predictions when query is empty string", async () => {
    (temporalService.getTopForTimeSlot as Mock).mockResolvedValue([]);
    (patternRepository.findMostRecentPattern as Mock).mockResolvedValue(null);

    const results = await predictionService.predict("user-1", { query: "" });

    expect(results).toEqual([]);
    expect(temporalService.getTopForTimeSlot).toHaveBeenCalled();
  });

  it("augments results with top cluster member from best match", async () => {
    const mockPatterns = [
      { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-eggs", userId: "user-1", titleHash: "c", rawTitle: "get eggs", frequency: 2, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);
    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ milk: 0.5, buy: 0.3 });
    (clusterRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { milk: 0.5, buy: 0.3, bread: 0.3 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
    ]);
    (patternRepository.findPatternsByCluster as Mock).mockResolvedValue([
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
    ]);

    const results = await predictionService.predict("user-1", { query: "mil" });

    expect(results).toHaveLength(2);
    expect(results.map(r => r.rawTitle)).toContain("buy milk");
    expect(results.map(r => r.rawTitle)).toContain("buy bread");
    expect(results.find(r => r.rawTitle === "buy bread")?.reason).toBe("cluster: buy milk");
  });

  it("does not augment when best match has no cluster", async () => {
    const mockPatterns = [
      { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);
    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ milk: 0.5 });
    (clusterRepository.findClusters as Mock).mockResolvedValue([]);

    const results = await predictionService.predict("user-1", { query: "mil" });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("buy milk");
  });

  it("does not augment when all cluster members are already in top 6", async () => {
    const mockPatterns = [
      { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
    ];
    (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);
    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ milk: 0.6, buy: 0.4 });
    (clusterRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { milk: 0.6, buy: 0.4 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
    ]);
    (patternRepository.findPatternsByCluster as Mock).mockResolvedValue([
      { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
    ]);

    const results = await predictionService.predict("user-1", { query: "buy" });

    expect(results).toHaveLength(2);
    expect(results.map(r => r.rawTitle)).toEqual(["buy milk", "buy bread"]);
    expect(results.every(r => r.reason === "query match")).toBe(true);
  });
});
