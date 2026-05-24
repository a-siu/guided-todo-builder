import { temporalService } from "@/lib/services/temporal.service";
import { transitionService } from "@/lib/services/transition.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";
import { Prediction } from "@/lib/types";

const WEIGHTS = {
  temporal: 0.3,
  sequential: 0.4,
  semantic: 0.3,
};

interface PredictOpts {
  currentPatternId?: string;
  hour?: number;
  day?: number;
}

export const predictionService = {
  async predict(userId: string, opts: PredictOpts): Promise<Prediction[]> {
    const now = new Date();
    const hour = opts.hour ?? now.getUTCHours();
    const day = opts.day ?? now.getUTCDay();
    const scored = new Map<string, { title: string; score: number; reasons: string[] }>();

    const temporals = await temporalService.getTopForTimeSlot(userId, new Date(), 5);
    for (const { pattern, count } of temporals) {
      const entry = scored.get(pattern.id) ?? { title: pattern.rawTitle, score: 0, reasons: [] };
      entry.score += count * WEIGHTS.temporal;
      entry.reasons.push("temporal");
      scored.set(pattern.id, entry);
    }

    if (opts.currentPatternId) {
      const sequentials = await transitionService.getTopFollowUps(userId, opts.currentPatternId, 5);
      for (const { toPattern, count } of sequentials) {
        const entry = scored.get(toPattern.id) ?? { title: toPattern.rawTitle, score: 0, reasons: [] };
        entry.score += count * WEIGHTS.sequential;
        entry.reasons.push("sequential");
        scored.set(toPattern.id, entry);
      }

      const currentPattern = await predictionRepository.findPatternById(opts.currentPatternId);
      if (currentPattern?.clusterId) {
        const semantics = await predictionRepository.findPatternsByCluster(currentPattern.clusterId, 5);
        for (const pattern of semantics) {
          if (pattern.id === opts.currentPatternId) continue;
          const entry = scored.get(pattern.id) ?? { title: pattern.rawTitle, score: 0, reasons: [] };
          entry.score += pattern.frequency * WEIGHTS.semantic;
          entry.reasons.push("semantic");
          scored.set(pattern.id, entry);
        }
      }
    }

    const sorted = Array.from(scored.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([patternId, data]) => ({
        patternId,
        rawTitle: data.title,
        score: Math.round(data.score * 100) / 100,
        reason: data.reasons.join(", "),
      }));

    return sorted;
  },
};
