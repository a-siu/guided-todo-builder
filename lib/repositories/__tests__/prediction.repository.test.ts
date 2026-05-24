import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pattern: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    termDf: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    cluster: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    temporalPattern: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    transition: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("predictionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a pattern", async () => {
    const mockPattern = {
      id: "pat-1",
      userId: "user-1",
      titleHash: "abc123",
      rawTitle: "buy groceries",
      frequency: 1,
      clusterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (prisma.pattern.upsert as Mock).mockResolvedValue(mockPattern);

    const result = await predictionRepository.upsertPattern("user-1", "abc123", "buy groceries");

    expect(prisma.pattern.upsert).toHaveBeenCalledWith({
      where: { userId_titleHash: { userId: "user-1", titleHash: "abc123" } },
      create: { userId: "user-1", titleHash: "abc123", rawTitle: "buy groceries" },
      update: { rawTitle: "buy groceries", frequency: { increment: 1 } },
    });
    expect(result).toEqual(mockPattern);
  });

  it("upserts a term DF counter", async () => {
    const mockTermDf = { id: "td-1", userId: "user-1", term: "groceri", df: 1 };
    (prisma.termDf.upsert as Mock).mockResolvedValue(mockTermDf);

    const result = await predictionRepository.upsertTermDf("user-1", "groceri");

    expect(prisma.termDf.upsert).toHaveBeenCalledWith({
      where: { userId_term: { userId: "user-1", term: "groceri" } },
      create: { userId: "user-1", term: "groceri" },
      update: { df: { increment: 1 } },
    });
    expect(result).toEqual(mockTermDf);
  });

  it("finds clusters by userId", async () => {
    const mockClusters = [{ id: "cl-1", userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1, createdAt: new Date(), updatedAt: new Date() }];
    (prisma.cluster.findMany as Mock).mockResolvedValue(mockClusters);

    const result = await predictionRepository.findClusters("user-1");

    expect(prisma.cluster.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockClusters);
  });

  it("creates a cluster", async () => {
    const mockCluster = { id: "cl-1", userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1, createdAt: new Date(), updatedAt: new Date() };
    (prisma.cluster.create as Mock).mockResolvedValue(mockCluster);

    const result = await predictionRepository.createCluster("user-1", { groceri: 0.5 });

    expect(prisma.cluster.create).toHaveBeenCalledWith({
      data: { userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1 },
    });
    expect(result).toEqual(mockCluster);
  });

  it("updates a cluster centroid", async () => {
    const mockCluster = { id: "cl-1", userId: "user-1", centroid: { groceri: 0.6 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() };
    (prisma.cluster.update as Mock).mockResolvedValue(mockCluster);

    const result = await predictionRepository.updateClusterCentroid("cl-1", { groceri: 0.6 }, 2);

    expect(prisma.cluster.update).toHaveBeenCalledWith({
      where: { id: "cl-1" },
      data: { centroid: { groceri: 0.6 }, memberCount: 2 },
    });
    expect(result).toEqual(mockCluster);
  });

  it("updates pattern cluster assignment", async () => {
    (prisma.pattern.update as Mock).mockResolvedValue(null);

    await predictionRepository.assignPatternToCluster("pat-1", "cl-1");

    expect(prisma.pattern.update).toHaveBeenCalledWith({
      where: { id: "pat-1" },
      data: { clusterId: "cl-1" },
    });
  });

  it("upserts a temporal record", async () => {
    const mockTemporal = { id: "tp-1", patternId: "pat-1", hourBucket: 14, dayBucket: 1, weekBucket: null, count: 1 };
    (prisma.temporalPattern.upsert as Mock).mockResolvedValue(mockTemporal);

    const result = await predictionRepository.upsertTemporal("pat-1", 14, 1);

    expect(prisma.temporalPattern.upsert).toHaveBeenCalledWith({
      where: { patternId_hourBucket_dayBucket: { patternId: "pat-1", hourBucket: 14, dayBucket: 1 } },
      create: { patternId: "pat-1", hourBucket: 14, dayBucket: 1 },
      update: { count: { increment: 1 } },
    });
    expect(result).toEqual(mockTemporal);
  });

  it("finds top temporal patterns", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.temporalPattern.findMany as Mock).mockResolvedValue([{ pattern: mockPatterns[0], count: 3 }]);

    const result = await predictionRepository.findTopTemporal("user-1", 14, 1, 5);

    expect(prisma.temporalPattern.findMany).toHaveBeenCalledWith({
      where: { hourBucket: 14, dayBucket: 1, pattern: { userId: "user-1" } },
      orderBy: { count: "desc" },
      take: 5,
      include: { pattern: true },
    });
    expect(result).toHaveLength(1);
  });

  it("upserts a transition", async () => {
    const mockTransition = { id: "tr-1", userId: "user-1", fromPatternId: "pat-1", toPatternId: "pat-2", count: 1 };
    (prisma.transition.upsert as Mock).mockResolvedValue(mockTransition);

    const result = await predictionRepository.upsertTransition("user-1", "pat-1", "pat-2");

    expect(prisma.transition.upsert).toHaveBeenCalledWith({
      where: { userId_fromPatternId_toPatternId: { userId: "user-1", fromPatternId: "pat-1", toPatternId: "pat-2" } },
      create: { userId: "user-1", fromPatternId: "pat-1", toPatternId: "pat-2" },
      update: { count: { increment: 1 } },
    });
    expect(result).toEqual(mockTransition);
  });

  it("finds top transitions", async () => {
    const mockPatterns = [{ id: "pat-2", userId: "user-1", titleHash: "def", rawTitle: "cook dinner", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.transition.findMany as Mock).mockResolvedValue([{ toPattern: mockPatterns[0], count: 2 }]);

    const result = await predictionRepository.findTopTransitions("user-1", "pat-1", 5);

    expect(prisma.transition.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", fromPatternId: "pat-1" },
      orderBy: { count: "desc" },
      take: 5,
      include: { toPattern: true },
    });
    expect(result).toHaveLength(1);
  });

  it("finds patterns by cluster", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.pattern.findMany as Mock).mockResolvedValue(mockPatterns);

    const result = await predictionRepository.findPatternsByCluster("cl-1", 5);

    expect(prisma.pattern.findMany).toHaveBeenCalledWith({
      where: { clusterId: "cl-1" },
      orderBy: { frequency: "desc" },
      take: 5,
    });
    expect(result).toEqual(mockPatterns);
  });

  it("finds a pattern by id", async () => {
    const mockPattern = { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() };
    (prisma.pattern.findFirst as Mock).mockResolvedValue(mockPattern);

    const result = await predictionRepository.findPatternById("pat-1");

    expect(prisma.pattern.findFirst).toHaveBeenCalledWith({ where: { id: "pat-1" } });
    expect(result).toEqual(mockPattern);
  });

  it("gets all patterns for a user", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.pattern.findMany as Mock).mockResolvedValue(mockPatterns);

    const result = await predictionRepository.getAllPatterns("user-1");

    expect(prisma.pattern.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockPatterns);
  });

  it("gets term DFs for a user", async () => {
    const mockTerms = [{ id: "td-1", userId: "user-1", term: "groceri", df: 5 }];
    (prisma.termDf.findMany as Mock).mockResolvedValue(mockTerms);

    const result = await predictionRepository.getTermDfs("user-1");

    expect(prisma.termDf.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockTerms);
  });
});
