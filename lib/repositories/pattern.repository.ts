import { prisma } from "@/lib/prisma";
import { Pattern } from "@/lib/types";

export const patternRepository = {
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

  async assignPatternToCluster(patternId: string, clusterId: string): Promise<void> {
    await prisma.pattern.update({
      where: { id: patternId },
      data: { clusterId },
    });
  },
};
