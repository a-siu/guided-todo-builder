import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transition: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { transitionRepository } from "@/lib/repositories/transition.repository";

describe("transitionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a transition", async () => {
    const mockTransition = { id: "tr-1", userId: "user-1", fromPatternId: "pat-1", toPatternId: "pat-2", count: 1 };
    (prisma.transition.upsert as Mock).mockResolvedValue(mockTransition);

    const result = await transitionRepository.upsertTransition("user-1", "pat-1", "pat-2");

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

    const result = await transitionRepository.findTopTransitions("user-1", "pat-1", 5);

    expect(prisma.transition.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", fromPatternId: "pat-1" },
      orderBy: { count: "desc" },
      take: 5,
      include: { toPattern: true },
    });
    expect(result).toHaveLength(1);
  });
});
