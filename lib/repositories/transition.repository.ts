import { prisma } from "@/lib/prisma";
import { Pattern, Transition } from "@/lib/types";

export const transitionRepository = {
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
