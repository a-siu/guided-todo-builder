import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pattern: { findMany: vi.fn() },
    termDf: { findMany: vi.fn() },
    cluster: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { predictionService } from "@/lib/services/prediction.service";

const userId = "test-user";
const basePattern = {
  userId,
  titleHash: "",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setupData(patterns: Record<string, unknown>[], termDfs: Record<string, unknown>[], clusters: Record<string, unknown>[]) {
  const patternRows = patterns.map((p) => ({ ...basePattern, ...p }));
  (prisma.pattern.findMany as Mock).mockImplementation((args?: { where?: { userId?: string; clusterId?: string }; orderBy?: Record<string, string>; take?: number }) => {
    if (args?.where?.clusterId) {
      return patternRows
        .filter((p) => p.clusterId === args.where.clusterId)
        .sort((a, b) => (b.frequency as number) - (a.frequency as number))
        .slice(0, args.take ?? 5);
    }
    return patternRows;
  });
  (prisma.termDf.findMany as Mock).mockResolvedValue(termDfs);
  (prisma.cluster.findMany as Mock).mockResolvedValue(clusters);
}

describe("predictionService integration — cluster augmentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("augments query results with related pattern from same cluster via real TF-IDF", async () => {
    setupData(
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

    const results = await predictionService.predict(userId, { query: "walk" });

    expect(results).toHaveLength(2);
    expect(results[0].rawTitle).toBe("walk dog");
    expect(results[0].reason).toBe("query match");
    expect(results[1].rawTitle).toBe("feed dog");
    expect(results[1].reason).toBe("cluster: walk dog");
  });

  it("does not augment when best match has no cluster", async () => {
    setupData(
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
    setupData(
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

    const results = await predictionService.predict(userId, { query: "bu" });

    expect(results).toHaveLength(2);
    expect(results[0].rawTitle).toBe("buy milk");
    expect(results[0].reason).toBe("query match");
    expect(results[1].rawTitle).toBe("organic milk");
    expect(results[1].reason).toBe("cluster: buy milk");
  });
});
