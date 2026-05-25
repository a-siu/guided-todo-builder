# Intelligent Todo Prediction System

## Overview

A per-user TF-IDF vector system that enables todo prediction, recurring todo detection, and semantic clustering. All computation is local (Postgres + in-process), no external APIs.

## Architecture

### Write Path
```
Create/Update Todo
  │
  ▼
todo.service
  ├── pattern.service    (normalize, hash, upsert pattern)
  ├── tfidf.service      (per-user DF + centroid update + cluster assign)
  ├── temporal.service   (hour/day bucket upsert)
  └── transition.service (prev→next sequence counter)
        │
        ▼
    repositories → Prisma → PostgreSQL
```

### Read Path
```
Predict Request
  │
  ▼
prediction.service
  ├── temporalScore(userId, hour, day)
  ├── sequentialScore(userId, fromPatternId)
  ├── semanticScore(userId, clusterId)
  └── blend(weights) → top 3
        │
        ▼
    repositories → Prisma → PostgreSQL
```

```
Predict
  │
  ▼
prediction.service
  ├── temporalScore(userId, hour, day)     → top patterns for this time
  ├── sequentialScore(userId, fromPatternId) → top follow-up patterns
  ├── semanticScore(userId, clusterId)     → top active cluster patterns
  └── blend(weights)                       → top 3 ranked predictions
```

## Data Model

### Pattern
- `id` UUID PK
- `userId` FK → User
- `titleHash` SHA-256 of normalized title (unique per user)
- `rawTitle` most recent title text (user's own)
- `frequency` int, defaults 1, incremented on reuse
- `clusterId` nullable FK → Cluster
- `createdAt`, `updatedAt`

### TermDf
- `id` UUID PK
- `userId` FK → User
- `term` varchar(50)
- `df` int, document frequency
- `@@unique([userId, term])`

### Cluster
- `id` UUID PK
- `userId` FK → User
- `centroid` JSON — `{term: weight, ...}` top-K weighted terms
- `memberCount` int, default 0
- `createdAt`, `updatedAt`

### TemporalPattern
- `id` UUID PK
- `patternId` FK → Pattern
- `hourBucket` int (0-23)
- `dayBucket` int (0-6, Sun-Sat)
- `weekBucket` int? (ISO week, null if no weekly pattern)
- `count` int, default 1
- `@@unique([patternId, hourBucket, dayBucket])`

### Transition
- `id` UUID PK
- `userId` FK → User
- `fromPatternId` FK → Pattern
- `toPatternId` FK → Pattern
- `count` int, default 1
- `@@unique([userId, fromPatternId, toPatternId])`

## Vector Computation

### Write Path (per todo create/update)

1. **Normalize**: lowercase → split → stopword filter → stem (Porter/Snowball) → sort unique terms
2. **Upsert Pattern** by `(userId, titleHash)`, increment `frequency`
3. **Upsert TermDf** per term, increment `df`
4. **Cluster assignment**:
   - Compute pattern's TF (`termCount / totalTermsInDoc`)
   - Compute IDF (`log(totalPatterns / df)`)
   - TF-IDF vector = `{term: tf * idf, ...}`
   - Compare against existing cluster centroids:
      - Similarity = sum over overlapping terms of `min(centroidWeight, patternWeight)`
      - If ≥ `CLUSTER_SIMILARITY_THRESHOLD` (default 0.6, configurable), assign to best match, weight-in centroid
      - Otherwise, create new cluster with this pattern as centroid
5. **Upsert TemporalPattern** — increment count for `(hourBucket, dayBucket)`
6. **Insert Transition** — increment count for `(previousPatternId → thisPatternId)`

### Read Path (prediction)

```
predict(userId, opts: { currentPatternId?, hour?, day? }) → Top 3
```

1. **Temporal score**: query top patterns for `(hour, day)` sorted by temporal.count DESC
2. **Sequential score**: if `currentPatternId`, query top transitions `where fromPatternId = currentPatternId` sorted by transition.count DESC
3. **Semantic score**: get cluster of `currentPatternId` (or user's most recent pattern if none provided), then query highest-frequency members of that cluster not completed today
4. **Blend**: weighted sum (defaults: temporal 0.3, sequential 0.4, semantic 0.3 — all configurable), return top 3 with `{patternId, rawTitle, score, reason}`

### Background Job (optional, periodic)

- Recompute all per-user cluster centroids from scratch (corrects drift)
- Runs every 24h or on explicit trigger
- Job: for each user, fetch all patterns → compute TF-IDF → k-means (k = sqrt(n/2)) → reassign + recenter

## Recurring Detection

Scan each user's patterns where:
- `temporal.count >= 3` (consistent)
- Same `hourBucket` + `dayBucket` across a consistent interval (weekly, biweekly, monthly)

If a pattern has been created on Mon 9am for 3+ consecutive weeks → flag as "weekly recurring."

API:
- `GET /api/patterns/recurring` — list detected recurring suggestions
- `POST /api/patterns/:id/recur` — confirm recurring, store interval metadata
- Recurring todo: on the predicted day+time, auto-create a new todo instance

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/predictions?currentTodoId=xxx` | Top 3 predictions with scores |
| GET | `/api/patterns/recurring` | Detected recurring patterns |
| POST | `/api/patterns/:id/recur` | Confirm recurring (body: `{interval}`) |
| DELETE | `/api/patterns/:id/recur` | Cancel recurring |

## Service Layer

### `prediction.service.ts`
- `predict(userId, opts)` → `Prediction[]`
- `recordTransition(userId, fromPatternId, toPatternId)`

### `pattern.service.ts`
- `normalizeTitle(title)` → `{hash, terms, stemmedTerms}`
- `upsertPattern(userId, normalized)` → `Pattern`
- `getPatternByHash(userId, hash)` → `Pattern | null`

### `tfidf.service.ts`
- `updateTermDf(userId, terms)` → updates per-term DF counters
- `computeTfIdf(userId, pattern)` → `Map<term, weight>`
- `assignToCluster(userId, vector)` → `clusterId`
- `recomputeClusters(userId)` → background full recompute

### `temporal.service.ts`
- `recordTime(userId, patternId, date)` → upsert TemporalPattern
- `getTopForTimeSlot(userId, hour, day, limit)` → patterns

### `transition.service.ts`
- `recordTransition(userId, fromId, toId)` → upsert Transition
- `getTopFollowUps(userId, fromId, limit)` → patterns

## Privacy & Security

- All vectors are per-user — no shared space
- No raw titles cross user boundaries
- Prediction is enabled by default for all users (no settings page yet; opt-out toggle can be added later)
- Background recompute is scoped to single user
- Pattern table stores user's own raw titles only
- Cluster centroids contain weighted terms, not raw titles

## Verification Criteria

1. Creating "buy groceries" → pattern created with normalized hash
2. Creating "buy groceries" again → frequency incremented, no duplicate pattern
3. Temporal bucket recorded for every create
4. Transition recorded from previous todo to current
5. Prediction returns relevant suggestions given context
6. Recurring detection flags weekly patterns after 3+ consistent occurrences
7. All tests pass with mocked Prisma
