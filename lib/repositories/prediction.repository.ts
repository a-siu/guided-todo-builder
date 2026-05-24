import { prisma } from "@/lib/prisma";
import { Pattern, Cluster, TermDf, Transition } from "@/lib/types";

export const predictionRepository = {
  // Pattern
  async upsertPattern(userId: string, titleHash: string, rawTitle: string): Promise<Pattern> {
    return prisma.pattern.upsert({
      where: { userId_titleHash: { userId, titleHash } },
      create: { userId, titleHash, rawTitle },
      update: { rawTitle, frequency: { increment: 1 } },
    });
  },

  async findPatternById(id: string): Promise<Pattern | null> {
    return prisma.pattern.findFirst({ where: { id } });
  },

  async findPatternsByCluster(clusterId: string, limit: number): Promise<Pattern[]> {
    return prisma.pattern.findMany({
      where: { clusterId },
      orderBy: { frequency: "desc" },
      take: limit,
    });
  },

  async getAllPatterns(userId: string): Promise<Pattern[]> {
    return prisma.pattern.findMany({ where: { userId } });
  },

  // Term DF
  async upsertTermDf(userId: string, term: string): Promise<TermDf> {
    return prisma.termDf.upsert({
      where: { userId_term: { userId, term } },
      create: { userId, term },
      update: { df: { increment: 1 } },
    });
  },

  async getTermDfs(userId: string): Promise<TermDf[]> {
    return prisma.termDf.findMany({ where: { userId } });
  },

  // Cluster
  async createCluster(userId: string, centroid: Record<string, number>): Promise<Cluster> {
    const result = await prisma.cluster.create({
      data: { userId, centroid, memberCount: 1 },
    }) as Cluster;
    return result;
  },

  async updateClusterCentroid(clusterId: string, centroid: Record<string, number>, memberCount: number): Promise<Cluster> {
    const result = await prisma.cluster.update({
      where: { id: clusterId },
      data: { centroid, memberCount },
    }) as Cluster;
    return result;
  },

  async findClusters(userId: string): Promise<Cluster[]> {
    const results = await prisma.cluster.findMany({ where: { userId } });
    return results.map((c) => ({ ...c, centroid: c.centroid as Record<string, number> }));
  },

  async assignPatternToCluster(patternId: string, clusterId: string): Promise<void> {
    await prisma.pattern.update({
      where: { id: patternId },
      data: { clusterId },
    });
  },

  // Temporal
  async upsertTemporal(patternId: string, hourBucket: number, dayBucket: number) {
    return prisma.temporalPattern.upsert({
      where: { patternId_hourBucket_dayBucket: { patternId, hourBucket, dayBucket } },
      create: { patternId, hourBucket, dayBucket },
      update: { count: { increment: 1 } },
    });
  },

  async findTopTemporal(userId: string, hourBucket: number, dayBucket: number, limit: number): Promise<{ pattern: Pattern; count: number }[]> {
    const results = await prisma.temporalPattern.findMany({
      where: { hourBucket, dayBucket, pattern: { userId } },
      orderBy: { count: "desc" },
      take: limit,
      include: { pattern: true },
    });
    return results.map((r) => ({ pattern: r.pattern, count: r.count }));
  },

  // Transition
  async upsertTransition(userId: string, fromPatternId: string, toPatternId: string): Promise<Transition> {
    return prisma.transition.upsert({
      where: { userId_fromPatternId_toPatternId: { userId, fromPatternId, toPatternId } },
      create: { userId, fromPatternId, toPatternId },
      update: { count: { increment: 1 } },
    });
  },

  async findTopTransitions(userId: string, fromPatternId: string, limit: number): Promise<{ toPattern: Pattern; count: number }[]> {
    const results = await prisma.transition.findMany({
      where: { userId, fromPatternId },
      orderBy: { count: "desc" },
      take: limit,
      include: { toPattern: true },
    });
    return results.map((r) => ({ toPattern: r.toPattern, count: r.count }));
  },
};
