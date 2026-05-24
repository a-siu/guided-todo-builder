import { predictionRepository } from "@/lib/repositories/prediction.repository";
import { Pattern } from "@/lib/types";

export const transitionService = {
  async recordTransition(userId: string, fromPatternId: string, toPatternId: string): Promise<void> {
    await predictionRepository.upsertTransition(userId, fromPatternId, toPatternId);
  },

  async getTopFollowUps(userId: string, fromPatternId: string, limit: number): Promise<{ toPattern: Pattern; count: number }[]> {
    return predictionRepository.findTopTransitions(userId, fromPatternId, limit);
  },
};
