import { prisma } from "@/lib/prisma";
import { Cluster, TermDf } from "@/lib/types";

export const clusterRepository = {
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
};
