# Adaptable Temporal — Interval-Learning Prediction Signal

## Overview

Replace the current rigid `(hourBucket, dayBucket)` temporal signal with a statistical interval-learning system. Instead of "what does the user usually do at 9 AM on Monday," the system learns "how long does the user typically wait before doing this task again" and scores predictions accordingly.

## Motivation

The existing temporal system buckets by time-of-day and day-of-week. This fails for patterns that span consecutive days (e.g., "go to gym" Mon, Tue, Wed — on Wednesday the temporal score is 0 because no prior Wednesday bucket exists). Interval learning generalizes: it captures daily, every-other-day, weekly, biweekly, and irregular patterns through a single mechanism.

## Schema Change

Remove `TemporalPattern` table. Add 4 fields to `Pattern`:

| Field | Type | Purpose |
|---|---|---|
| `lastOccurredAt` | `DateTime?` | Timestamp of the most recent occurrence of this pattern |
| `meanInterval` | `Float?` | Running mean of inter-arrival times (hours) |
| `varianceM2` | `Float?` | Welford's M2 — sum of squared diffs from running mean |
| `intervalCount` | `Int @default(0)` | Number of intervals observed (`frequency - 1`) |

No new tables. No orphaned `TemporalPattern` or `weekBucket`.

## Write Path — Recording

`temporalService.recordTime(patternId, date)`:

1. Load pattern's `lastOccurredAt`, `meanInterval`, `varianceM2`, `intervalCount`
2. If `lastOccurredAt` is null:
   - Set `lastOccurredAt = date`, save, return (first occurrence, no interval yet)
3. If `lastOccurredAt` is set:
   - `deltaHours = (date - lastOccurredAt) / 3600000`
   - `intervalCount++`
   - If `intervalCount == 1` (first interval):
     - `meanInterval = deltaHours`, `varianceM2 = 0`
   - Else (Welford's online update):
     - `prevMean = meanInterval`
     - `meanInterval += (deltaHours - prevMean) / intervalCount`
     - `varianceM2 += (deltaHours - prevMean) * (deltaHours - meanInterval)`
   - Set `lastOccurredAt = date`, save all fields

## Read Path — Prediction

`temporalService.getTopPatterns(userId, now, limit)`:

1. Fetch all patterns for user where `intervalCount >= 1`
2. For each:
   - `elapsedHours = (now - lastOccurredAt) / 3600000`
   - `stddev = sqrt(varianceM2 / intervalCount)` (population stddev), floored at 1.0
   - `z = (elapsedHours - meanInterval) / stddev`
   - `score = intervalCount * exp(-0.5 * z²)`
3. Sort by score desc, take top `limit`, return `{ pattern, count: score }`
4. `prediction.service.ts` consumes these identically to the old `getTopForTimeSlot`

### Edge Cases

| Condition | Behavior |
|---|---|
| `intervalCount == 0` (only seen once) | Pattern excluded, contributes 0 temporal score |
| `intervalCount == 1` (one interval, varianceM2=0) | stddev floors to 1h; score peaks at `elapsed == meanInterval` |
| `elapsed << meanInterval` (just did it) | Large negative z → score ≈ 0 |
| `elapsed ≈ meanInterval` (due) | z ≈ 0 → near-maximum score |
| `elapsed >> meanInterval` (overdue) | Large positive z → score ≈ 0 |

## Scoring in Prediction Blend

Existing blend unchanged. Temporal scores enter `predictionService.predict()` with weight 0.3, summed with sequential (0.4) and semantic (0.3). The prediction service calls the same `temporalService.getTopForTimeSlot(userId, date, 5)` interface — only the internals change.

## Example

Pattern "gym" with occurrences at Mon 9am, Tue 8am, Wed 10am:
- delta_1 = ~23h, delta_2 = ~26h
- After 3 occurrences: `meanInterval ≈ 24.5h`, `varianceM2 ≈ 4.5`, `stddev ≈ 1.5h`
- Thu 9am: `elapsed ≈ 23h`, `z ≈ -1.0`, `score ≈ 2 × exp(-0.5) ≈ 1.21`
- Old system: score = 0 (Thursday has no bucket)

Pattern "buy groceries" with occurrences every Sat 9am for 4 weeks:
- All deltas ≈ 168h (7 days)
- `meanInterval ≈ 168h`, `varianceM2 ≈ 0`, `stddev` floors to 1h
- Next Sat 9am: `elapsed ≈ 168h`, `z ≈ 0`, `score ≈ 3 × 1.0 = 3.0` (boosted because pattern is well-established)

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add 4 fields to Pattern, drop TemporalPattern |
| `lib/services/temporal.service.ts` | Rewrite `recordTime` and `getTopForTimeSlot` |
| `lib/services/__tests__/temporal.service.test.ts` | Rewrite tests for interval-based logic |
| `lib/repositories/temporal.repository.ts` | Replace upsertTemporal/findTopTemporal with pattern field updates + query |
| `lib/repositories/__tests__/temporal.repository.test.ts` | Rewrite tests |
| `lib/types.ts` | Update any types referencing old temporal structures |
| `prisma/seed.ts` | No seed file exists; nothing to update |

No changes to: `prediction.service.ts`, `prediction-orchestrator.service.ts`, `transition.service.ts`, or their tests.

## Verification

1. First todo create → pattern has `lastOccurredAt` set, no interval recorded
2. Second same-pattern create → delta computed, `meanInterval` and `intervalCount` set
3. Third same-pattern create → Welford's update with correct incremental mean/variance
4. Prediction returns patterns whose `elapsed ≈ meanInterval` with score proportional to `intervalCount`
5. Pattern with single occurrence never appears in temporal predictions
6. Overdue patterns decay to 0 score
7. All existing prediction service tests still pass (temporal is mocked)
