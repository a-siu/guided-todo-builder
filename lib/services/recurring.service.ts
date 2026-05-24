import { predictionRepository } from "@/lib/repositories/prediction.repository";

export const recurringService = {
  async detectRecurring(userId: string): Promise<{ patternId: string; title: string; frequency: number; interval: string }[]> {
    const patterns = await predictionRepository.getAllPatterns(userId);
    const recurring = patterns
      .filter((p) => p.frequency >= 3)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)
      .map((p) => ({
        patternId: p.id,
        title: p.rawTitle,
        frequency: p.frequency,
        interval: "detected",
      }));

    return recurring;
  },
};
