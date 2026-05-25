import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pattern: { findMany: vi.fn() },
    termDf: { findMany: vi.fn() },
    cluster: { findMany: vi.fn() },
    temporalPattern: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/services/pattern.service", () => ({
  patternService: {
    normalizeTitle: vi.fn((title: string) => {
      const cleaned = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const tokens = cleaned.split(/\s+/).filter(Boolean);
      return { hash: tokens.join(","), terms: Array.from(new Set(tokens)), stemmedTerms: Array.from(new Set(tokens)) };
    }),
  },
}));

vi.mock("@/lib/services/tfidf.service", () => ({
  tfidfService: {
    computeTfIdf: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/pattern.repository", () => ({
  patternRepository: {
    findPatternsByCluster: vi.fn(),
    getAllPatterns: vi.fn(),
    findMostRecentPattern: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/cluster.repository", () => ({
  clusterRepository: {
    findClusters: vi.fn(),
  },
}));

vi.mock("@/lib/services/temporal.service", () => ({
  temporalService: {
    getTopForTimeSlot: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { predictionService } from "@/lib/services/prediction.service";
import { tfidfService } from "@/lib/services/tfidf.service";
import { patternRepository } from "@/lib/repositories/pattern.repository";
import { clusterRepository } from "@/lib/repositories/cluster.repository";

const userId = "test-user";
const basePattern = {
  userId,
  titleHash: "",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setupMocks(patterns: Record<string, unknown>[], termDfs: Record<string, unknown>[], clusters: Record<string, unknown>[]) {
  const patternRows = patterns.map((p) => ({ ...basePattern, ...p }));
  (prisma.pattern.findMany as Mock).mockImplementation((args?: { where?: { userId?: string; clusterId?: string }; orderBy?: Record<string, string>; take?: number }) => {
    if (args?.where?.clusterId) {
      return Promise.resolve(
        patternRows
          .filter((p) => p.clusterId === args.where.clusterId)
          .sort((a, b) => (b.frequency as number) - (a.frequency as number))
          .slice(0, args.take ?? 5)
      );
    }
    return Promise.resolve(patternRows);
  });
  (prisma.termDf.findMany as Mock).mockResolvedValue(termDfs);
  (prisma.cluster.findMany as Mock).mockResolvedValue(clusters);
  (prisma.temporalPattern.findMany as Mock).mockResolvedValue([]);
  (patternRepository.getAllPatterns as Mock).mockResolvedValue(patternRows);
  (patternRepository.findMostRecentPattern as Mock).mockResolvedValue(null);
  (patternRepository.findPatternsByCluster as Mock).mockImplementation((clusterId: string, limit?: number) =>
    Promise.resolve(patternRows.filter((p) => p.clusterId === clusterId).sort((a, b) => (b.frequency as number) - (a.frequency as number)).slice(0, limit))
  );
  (clusterRepository.findClusters as Mock).mockResolvedValue(clusters);
  (tfidfService.computeTfIdf as Mock).mockResolvedValue({});
}

function setupClusterMockForQuery(bestPatternTitle: string, centroid: Record<string, number>) {
  (tfidfService.computeTfIdf as Mock).mockImplementation(async (userId: string, terms: string[]) => {
    const vector: Record<string, number> = {};
    for (const term of terms) {
      const df = 1;
      vector[term] = 1 / df;
    }
    return vector;
  });
  (clusterRepository.findClusters as Mock).mockResolvedValue([
    { id: "cl-1", userId, centroid, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
  ]);
}

describe("predictionService integration — cluster augmentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("augments query results with related pattern from same cluster via real TF-IDF", async () => {
    setupMocks(
      [
        { id: "pat-walk-dog", rawTitle: "walk dog", frequency: 3, clusterId: "cl-1" },
        { id: "pat-feed-dog", rawTitle: "feed dog", frequency: 2, clusterId: "cl-1" },
        { id: "pat-buy-milk", rawTitle: "buy milk", frequency: 24, clusterId: null },
        { id: "pat-get-eggs", rawTitle: "get eggs", frequency: 1, clusterId: null },
      ],
      [
        { userId, term: "walk", df: 1 },
        { userId, term: "dog", df: 2 },
        { userId, term: "feed", df: 1 },
      ],
      [
        { id: "cl-1", userId, centroid: { walk: 0.347, dog: 0.347, feed: 0.347 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
      ],
    );

    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ walk: 0.347, dog: 0.347, feed: 0 });

    const results = await predictionService.predict(userId, { query: "walk" });

    expect(results).toHaveLength(2);
    expect(results[0].rawTitle).toBe("walk dog");
    expect(results[0].reason).toBe("query match");
    expect(results[1].rawTitle).toBe("feed dog");
    expect(results[1].reason).toBe("cluster: walk dog");
  });

  it("does not augment when best match has no cluster", async () => {
    setupMocks(
      [
        { id: "pat-walk-dog", rawTitle: "walk dog", frequency: 3, clusterId: null },
        { id: "pat-feed-dog", rawTitle: "feed dog", frequency: 2, clusterId: null },
      ],
      [],
      [],
    );

    const results = await predictionService.predict(userId, { query: "walk" });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("walk dog");
    expect(results[0].reason).toBe("query match");
  });

  it("augments via TF-IDF including common words like 'buy' which IDF naturally downweights", async () => {
    setupMocks(
      [
        { id: "pat-milk", rawTitle: "buy milk", frequency: 10, clusterId: "cl-1" },
        { id: "pat-organic", rawTitle: "organic milk", frequency: 3, clusterId: "cl-1" },
        { id: "pat-eggs", rawTitle: "get eggs", frequency: 1, clusterId: null },
        { id: "pat-walk", rawTitle: "walk dog", frequency: 1, clusterId: null },
        { id: "pat-read", rawTitle: "read book", frequency: 1, clusterId: null },
      ],
      [
        { userId, term: "buy", df: 1 },
        { userId, term: "milk", df: 2 },
        { userId, term: "organic", df: 1 },
      ],
      [
        { id: "cl-1", userId, centroid: { buy: 0.402, milk: 0.458, organic: 0.403 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
      ],
    );

    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ buy: 0.402, milk: 0.458, organic: 0 });

    const results = await predictionService.predict(userId, { query: "bu" });

    expect(results).toHaveLength(2);
    expect(results[0].rawTitle).toBe("buy milk");
    expect(results[0].reason).toBe("query match");
    expect(results[1].rawTitle).toBe("organic milk");
    expect(results[1].reason).toBe("cluster: buy milk");
  });

  it("returns empty array for empty query string", async () => {
    setupMocks([], [], []);

    const results = await predictionService.predict(userId, { query: "" });

    expect(results).toEqual([]);
  });

  it("returns empty array when no patterns match query terms", async () => {
    setupMocks(
      [
        { id: "pat-milk", rawTitle: "buy milk", frequency: 10, clusterId: null },
        { id: "pat-eggs", rawTitle: "get eggs", frequency: 1, clusterId: null },
      ],
      [],
      [],
    );

    const results = await predictionService.predict(userId, { query: "zzzzz" });

    expect(results).toEqual([]);
  });

  it("matches multiple patterns via substring overlap", async () => {
    setupMocks(
      [
        { id: "pat-milk", rawTitle: "buy milk", frequency: 5, clusterId: null },
        { id: "pat-bread", rawTitle: "buy bread", frequency: 3, clusterId: null },
        { id: "pat-butter", rawTitle: "buy butter", frequency: 2, clusterId: null },
      ],
      [],
      [],
    );

    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ buy: 0.5, milk: 0.3 });
    (clusterRepository.findClusters as Mock).mockResolvedValue([]);

    const results = await predictionService.predict(userId, { query: "buy" });

    expect(results).toHaveLength(3);
    expect(results[0].rawTitle).toBe("buy milk");
    expect(results[0].reason).toBe("query match");
  });

  it("scores by overlap count and frequency, sorted descending", async () => {
    setupMocks(
      [
        { id: "pat-bread", rawTitle: "buy bread", frequency: 1, clusterId: null },
        { id: "pat-milk", rawTitle: "buy milk", frequency: 10, clusterId: null },
      ],
      [],
      [],
    );

    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ buy: 0.5, milk: 0.3 });
    (clusterRepository.findClusters as Mock).mockResolvedValue([]);

    const results = await predictionService.predict(userId, { query: "buy" });

    expect(results).toHaveLength(2);
    expect(results[0].rawTitle).toBe("buy milk");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("uses token intersection for normalized term matching", async () => {
    setupMocks(
      [
        { id: "pat-milk", rawTitle: "buying milk", frequency: 5, clusterId: null },
        { id: "pat-bread", rawTitle: "buying bread", frequency: 3, clusterId: null },
      ],
      [],
      [],
    );

    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ buying: 0.5, milk: 0.3 });
    (clusterRepository.findClusters as Mock).mockResolvedValue([]);

    const results = await predictionService.predict(userId, { query: "milk" });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("buying milk");
    expect(results[0].reason).toBe("query match");
  });

  it("does not augment when cluster similarity below threshold", async () => {
    setupMocks(
      [
        { id: "pat-milk", rawTitle: "buy milk", frequency: 5, clusterId: "cl-1" },
        { id: "pat-bread", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1" },
      ],
      [],
      [
        { id: "cl-1", userId, centroid: { xyz: 0.1 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
      ],
    );

    (tfidfService.computeTfIdf as Mock).mockResolvedValue({ xyz: 0.05 });

    const results = await predictionService.predict(userId, { query: "mil" });

    expect(results).toHaveLength(1);
    expect(results[0].rawTitle).toBe("buy milk");
    expect(results[0].reason).toBe("query match");
  });
});
