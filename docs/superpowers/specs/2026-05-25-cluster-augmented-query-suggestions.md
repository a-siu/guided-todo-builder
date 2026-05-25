# Cluster-Augmented Query Suggestions — Design Spec

## Overview

When the user types a query, augment the substring-matching suggestions with one semantically related suggestion from the best match's cluster. This surfaces related tasks even when the partial query doesn't directly match their title.

## Algorithm

1. **Run existing substring matching** — compute scored list via `predictWithQuery()`
2. **If list is non-empty**, take `scored[0]` (best match)
3. **Normalize** `scored[0].rawTitle` via `patternService.normalizeTitle()` → stemmed terms
4. **Compute TF-IDF vector** via `tfidfService.computeTfIdf(userId, stemmedTerms)`
5. **Find nearest cluster** — iterate `clusterRepository.findClusters(userId)`, score each centroid via min-intersection against the vector, pick the best
6. **If cluster found**, get its top member by frequency that is NOT already in the results
7. **Score it** as `bestMatch.overlapCount * 2 + member.frequency`
8. **Reason** — `"cluster: <bestMatch.rawTitle>"`
9. **Merge** into scored list, sort desc, slice to top 5

## Edge Cases

| Condition | Behavior |
|-----------|----------|
| No best match (empty results) | Existing behavior — return `[]` |
| Best match has no cluster | Return existing results as-is |
| All cluster members already in top 5 | Return existing results as-is |
| TF-IDF vector is zero | Return existing results as-is (no cluster center will score > 0) |

## Files Changed

| File | Change |
|------|--------|
| `lib/services/prediction.service.ts` | After computing query matches, add cluster-augmented suggestion via `tfidfService` + `clusterRepository` |
| `lib/services/__tests__/prediction.service.test.ts` | Add tests: cluster-augmented appears, no cluster = no augmentation, all members already in top 5 = no change |
