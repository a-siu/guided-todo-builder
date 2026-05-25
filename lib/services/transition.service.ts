import { transitionRepository } from "@/lib/repositories/transition.repository";
import { Pattern } from "@/lib/types";

export const transitionService = {
  async recordTransition(userId: string, fromPatternId: string, toPatternId: string): Promise<void> {
    await transitionRepository.upsertTransition(userId, fromPatternId, toPatternId);
  },

  async getTopFollowUps(userId: string, fromPatternId: string, limit: number): Promise<{ toPattern: Pattern; count: number }[]> {
    return transitionRepository.findTopTransitions(userId, fromPatternId, limit);
  },
};
