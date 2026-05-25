import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    temporalPattern: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { temporalRepository } from "@/lib/repositories/temporal.repository";

describe("temporalRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a temporal record", async () => {
    const mockTemporal = { id: "tp-1", patternId: "pat-1", hourBucket: 14, dayBucket: 1, weekBucket: null, count: 1 };
    (prisma.temporalPattern.upsert as Mock).mockResolvedValue(mockTemporal);

    const result = await temporalRepository.upsertTemporal("pat-1", 14, 1);

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

    const result = await temporalRepository.findTopTemporal("user-1", 14, 1, 5);

    expect(prisma.temporalPattern.findMany).toHaveBeenCalledWith({
      where: { hourBucket: 14, dayBucket: 1, pattern: { userId: "user-1" } },
      orderBy: { count: "desc" },
      take: 5,
      include: { pattern: true },
    });
    expect(result).toHaveLength(1);
  });
});
