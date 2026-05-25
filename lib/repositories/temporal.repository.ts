import { prisma } from "@/lib/prisma";
import { Pattern } from "@/lib/types";

export const temporalRepository = {
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
};
