import { temporalService } from "@/lib/services/temporal.service";
import { transitionService } from "@/lib/services/transition.service";
import { patternRepository } from "@/lib/repositories/pattern.repository";
import { clusterRepository } from "@/lib/repositories/cluster.repository";
import { patternService } from "@/lib/services/pattern.service";
import { tfidfService } from "@/lib/services/tfidf.service";
import { Prediction, Pattern } from "@/lib/types";

const WEIGHTS = {
  temporal: 0.3,
  sequential: 0.4,
  semantic: 0.3,
};

const CLUSTER_SIMILARITY_THRESHOLD = 0.3;

interface PredictOpts {
  currentPatternId?: string;
  hour?: number;
  day?: number;
  minFrequency?: number;
  query?: string;
}

interface ScoredEntry {
  patternId: string;
  rawTitle: string;
  score: number;
  reason: string;
  overlapCount: number;
}

export const predictionService = {
  async predict(userId: string, opts: PredictOpts): Promise<Prediction[]> {
    if (opts.query) {
      return this.predictWithQuery(userId, opts.query);
    }

    const now = new Date();
    const hour = opts.hour ?? now.getUTCHours();
    const day = opts.day ?? now.getUTCDay();
    const scored = new Map<string, { title: string; score: number; frequency: number; reasons: string[] }>();

    const temporals = await temporalService.getTopForTimeSlot(userId, new Date(), 5);
    for (const { pattern, count } of temporals) {
      const entry = scored.get(pattern.id) ?? { title: pattern.rawTitle, score: 0, frequency: pattern.frequency, reasons: [] };
      entry.score += count * WEIGHTS.temporal;
      entry.reasons.push("temporal");
      scored.set(pattern.id, entry);
    }

    const effectivePatternId = opts.currentPatternId ?? (await patternRepository.findMostRecentPattern(userId))?.id;

    if (effectivePatternId) {
      const sequentials = await transitionService.getTopFollowUps(userId, effectivePatternId, 5);
      for (const { toPattern, count } of sequentials) {
        const entry = scored.get(toPattern.id) ?? { title: toPattern.rawTitle, score: 0, frequency: toPattern.frequency, reasons: [] };
        entry.score += count * WEIGHTS.sequential;
        entry.reasons.push("sequential");
        scored.set(toPattern.id, entry);
      }

      const currentPattern = await patternRepository.findPatternById(effectivePatternId);
      if (currentPattern?.clusterId) {
        const semantics = await patternRepository.findPatternsByCluster(currentPattern.clusterId, 5);
        for (const pattern of semantics) {
          if (pattern.id === effectivePatternId) continue;
          const entry = scored.get(pattern.id) ?? { title: pattern.rawTitle, score: 0, frequency: pattern.frequency, reasons: [] };
          entry.score += pattern.frequency * WEIGHTS.semantic;
          entry.reasons.push("semantic");
          scored.set(pattern.id, entry);
        }
      }
    }

    const sorted = Array.from(scored.entries())
      .filter(([, entry]) => opts.minFrequency === undefined || entry.frequency >= opts.minFrequency)
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

  async predictWithQuery(userId: string, query: string): Promise<Prediction[]> {
    const queryNorm = patternService.normalizeTitle(query);
    if (queryNorm.terms.length === 0) return [];

    const allPatterns = await patternRepository.getAllPatterns(userId);
    if (allPatterns.length === 0) return [];

    const scored: ScoredEntry[] = allPatterns
      .map((pattern) => {
        const patternNorm = patternService.normalizeTitle(pattern.rawTitle);
        const rawLower = pattern.rawTitle.toLowerCase();

        let overlapCount = 0;
        for (const term of queryNorm.terms) {
          if (rawLower.includes(term) || patternNorm.terms.includes(term)) {
            overlapCount++;
          }
        }

        if (overlapCount === 0) return null;

        const score = overlapCount * 2 + pattern.frequency;
        return { patternId: pattern.id, rawTitle: pattern.rawTitle, score, reason: "query match", overlapCount };
      })
      .filter((p): p is ScoredEntry => p !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (scored.length > 0) {
      const best = scored[0];
      const bestPattern = allPatterns.find((p): p is Pattern => p.id === best.patternId);
      if (bestPattern) {
        const { stemmedTerms } = patternService.normalizeTitle(bestPattern.rawTitle);
        const vector = await tfidfService.computeTfIdf(userId, stemmedTerms);
        const clusters = await clusterRepository.findClusters(userId);
        if (!clusters) return scored.map(({ overlapCount, ...p }) => ({ ...p, score: Math.round(p.score * 100) / 100 }));

        let bestClusterId: string | null = null;
        let bestScore = 0;
        for (const cluster of clusters) {
          const centroid = cluster.centroid as Record<string, number>;
          let score = 0;
          for (const term of Object.keys(vector)) {
            if (centroid[term]) {
              score += Math.min(vector[term], centroid[term]);
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestClusterId = cluster.id;
          }
        }

        if (bestClusterId && bestScore >= CLUSTER_SIMILARITY_THRESHOLD) {
          const clusterMembers = await patternRepository.findPatternsByCluster(bestClusterId, 5);
          const existingIds = new Set(scored.map((p) => p.patternId));
          const candidate = clusterMembers
            .filter((m) => !existingIds.has(m.id))
            .sort((a, b) => b.frequency - a.frequency)[0];

          if (candidate) {
            const clusterScore = best.overlapCount * 2 + candidate.frequency;
            scored.push({
              patternId: candidate.id,
              rawTitle: candidate.rawTitle,
              score: clusterScore,
              reason: `cluster: ${best.rawTitle}`,
              overlapCount: best.overlapCount,
            });
            scored.sort((a, b) => b.score - a.score);
            if (scored.length > 6) scored.pop();
          }
        }
      }
    }

    return scored.map(({ overlapCount, ...p }) => ({
      ...p,
      score: Math.round(p.score * 100) / 100,
    }));
  },
};
