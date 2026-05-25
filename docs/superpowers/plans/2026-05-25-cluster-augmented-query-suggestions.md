# Cluster-Augmented Query Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Augment substring-matching suggestions with one semantically related suggestion from the best match's TF-IDF cluster.

**Architecture:** After computing query results, take the best match, compute its TF-IDF vector, find the nearest cluster via min-intersection centroid scoring, pull that cluster's top member not already in results, score it using the best match's overlap count + the member's frequency, merge into top 5.

**Tech Stack:** TypeScript, Vitest 3 (mocked)

---

### Task 1: Cluster-augmented query predictions

**Files:**
- Modify: `lib/services/prediction.service.ts`
- Modify: `lib/services/__tests__/prediction.service.test.ts`

- [ ] **Step 1: Add mocks for tfidfService and clusterRepository in the test file**

Add after the `vi.mock("@/lib/services/transition.service"...)` block in `prediction.service.test.ts`:

```typescript
vi.mock("@/lib/services/tfidf.service", () => ({
  tfidfService: {
    computeTfIdf: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/cluster.repository", () => ({
  clusterRepository: {
    findClusters: vi.fn(),
  },
}));
```

Add these imports after `import { patternRepository }...`:

```typescript
import { tfidfService } from "@/lib/services/tfidf.service";
import { clusterRepository } from "@/lib/repositories/cluster.repository";
```

- [ ] **Step 2: Add test for cluster-augmented suggestion appearing**

Add after the existing `"falls back to blended predictions..."` test:

```typescript
it("augments results with top cluster member from best match", async () => {
  const mockPatterns = [
    { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-eggs", userId: "user-1", titleHash: "c", rawTitle: "get eggs", frequency: 2, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);
  (tfidfService.computeTfIdf as Mock).mockResolvedValue({ milk: 0.5, buy: 0.3 });
  (clusterRepository.findClusters as Mock).mockResolvedValue([
    { id: "cl-1", userId: "user-1", centroid: { milk: 0.4, bread: 0.3 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
  ]);

  const results = await predictionService.predict("user-1", { query: "mil" });

  expect(results).toHaveLength(2);
  expect(results.map(r => r.rawTitle)).toContain("buy milk");
  expect(results.map(r => r.rawTitle)).toContain("buy bread");
  expect(results.find(r => r.rawTitle === "buy bread")?.reason).toBe("cluster: buy milk");
});
```

- [ ] **Step 3: Add test for no cluster on best match (no augmentation)**

```typescript
it("does not augment when best match has no cluster", async () => {
  const mockPatterns = [
    { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);
  (tfidfService.computeTfIdf as Mock).mockResolvedValue({ milk: 0.5 });
  (clusterRepository.findClusters as Mock).mockResolvedValue([]);

  const results = await predictionService.predict("user-1", { query: "mil" });

  expect(results).toHaveLength(1);
  expect(results[0].rawTitle).toBe("buy milk");
});
```

- [ ] **Step 4: Add test for all cluster members already in results**

```typescript
it("does not augment when all cluster members are already in top 5", async () => {
  const mockPatterns = [
    { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
  ];
  (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);
  (tfidfService.computeTfIdf as Mock).mockResolvedValue({ milk: 0.5 });
  (clusterRepository.findClusters as Mock).mockResolvedValue([
    { id: "cl-1", userId: "user-1", centroid: { milk: 0.5, bread: 0.3 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() },
  ]);
  (patternRepository.findPatternsByCluster as Mock).mockResolvedValue([
    { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() },
  ]);

  const results = await predictionService.predict("user-1", { query: "mil" });

  expect(results).toHaveLength(2);
  expect(results.map(r => r.rawTitle)).toEqual(["buy milk", "buy bread"]);
  expect(results.every(r => r.reason === "query match")).toBe(true);
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/prediction.service.test.ts`
Expected: 3 new tests FAIL (existing 8 pass)

- [ ] **Step 6: Modify predictWithQuery to add cluster augmentation**

Replace `lib/services/prediction.service.ts` with:

```typescript
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

const CLUSTER_SIMILARITY_THRESHOLD = 0.6;

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
      .slice(0, 5);

    if (scored.length > 0) {
      const best = scored[0];
      const bestPattern = allPatterns.find((p): p is Pattern => p.id === best.patternId);
      if (bestPattern) {
        const { stemmedTerms } = patternService.normalizeTitle(bestPattern.rawTitle);
        const vector = await tfidfService.computeTfIdf(userId, stemmedTerms);
        const clusters = await clusterRepository.findClusters(userId);

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
            if (scored.length > 5) scored.pop();
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/prediction.service.test.ts`
Expected: All 11 tests PASS (8 old + 3 new)

- [ ] **Step 8: Run full test suite**

Run: `npx vitest run`
Expected: All 115 tests pass (3 new across the suite)

- [ ] **Step 9: Commit**

```bash
git add lib/services/prediction.service.ts lib/services/__tests__/prediction.service.test.ts
git commit -m "feat: augment query suggestions with top cluster member from best match"
```
