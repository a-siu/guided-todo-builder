# Intelligent Todo Prediction System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user TF-IDF vector system that predicts next todos, detects recurring patterns, and enables future recommendation features.

**Architecture:** Six new services (pattern, tfidf, temporal, transition, prediction, recurring) with one new repository. Write path hooks into `todo.service.createTodo`. Read path via `prediction.service.predict()`. All local Postgres, no external APIs. Per-user isolation — no cross-user data.

**Tech Stack:** Prisma 5, PostgreSQL 16, TypeScript, Vitest 3 (mocked)

---

### Task 1: Prisma Schema — Add 5 prediction models

**Files:**
- Modify: `prisma/schema.prisma`
- Run: `npm run db:push`

- [ ] **Step 1: Add models to schema.prisma**

Add these models after the existing `Todo` model:

```prisma
model Pattern {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id])
  titleHash String   @db.VarChar(64)
  rawTitle  String   @db.VarChar(200)
  frequency Int      @default(1)
  clusterId String?  @db.Uuid
  createdAt DateTime @default(now()) @db.Timestamptz()
  updatedAt DateTime @updatedAt @db.Timestamptz()

  cluster          Cluster?          @relation(fields: [clusterId], references: [id])
  temporals        TemporalPattern[]
  transitionsFrom  Transition[]      @relation("FromPattern")
  transitionsTo    Transition[]      @relation("ToPattern")

  @@unique([userId, titleHash])
  @@index([userId])
  @@index([clusterId])
}

model TermDf {
  id     String @id @default(uuid()) @db.Uuid
  userId String @db.Uuid
  user   User   @relation(fields: [userId], references: [id])
  term   String @db.VarChar(50)
  df     Int    @default(1)

  @@unique([userId, term])
  @@index([userId])
}

model Cluster {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  user        User     @relation(fields: [userId], references: [id])
  centroid    Json
  memberCount Int      @default(0)
  createdAt   DateTime @default(now()) @db.Timestamptz()
  updatedAt   DateTime @updatedAt @db.Timestamptz()

  patterns Pattern[]

  @@index([userId])
}

model TemporalPattern {
  id         String @id @default(uuid()) @db.Uuid
  patternId  String @db.Uuid
  pattern    Pattern @relation(fields: [patternId], references: [id])
  hourBucket Int    @default(0)
  dayBucket  Int    @default(0)
  weekBucket Int?
  count      Int    @default(1)

  @@unique([patternId, hourBucket, dayBucket])
}

model Transition {
  id            String @id @default(uuid()) @db.Uuid
  userId        String @db.Uuid
  fromPatternId String @db.Uuid
  toPatternId   String @db.Uuid
  count         Int    @default(1)

  fromPattern Pattern @relation("FromPattern", fields: [fromPatternId], references: [id])
  toPattern   Pattern @relation("ToPattern", fields: [toPatternId], references: [id])

  @@unique([userId, fromPatternId, toPatternId])
  @@index([userId, fromPatternId])
}
```

- [ ] **Step 2: Push to database**

Run: `npm run db:push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add prediction models (Pattern, TermDf, Cluster, TemporalPattern, Transition)"
```

---

### Task 2: Add prediction types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add prediction type interfaces**

Append to `lib/types.ts`:

```typescript
export interface Pattern {
  id: string;
  userId: string;
  titleHash: string;
  rawTitle: string;
  frequency: number;
  clusterId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TermDf {
  id: string;
  userId: string;
  term: string;
  df: number;
}

export interface Cluster {
  id: string;
  userId: string;
  centroid: Record<string, number>;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemporalRecord {
  id: string;
  patternId: string;
  hourBucket: number;
  dayBucket: number;
  weekBucket: number | null;
  count: number;
}

export interface Transition {
  id: string;
  userId: string;
  fromPatternId: string;
  toPatternId: string;
  count: number;
}

export interface Prediction {
  patternId: string;
  rawTitle: string;
  score: number;
  reason: string;
}

export interface NormalizedTitle {
  hash: string;
  terms: string[];
  stemmedTerms: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add prediction types"
```

---

### Task 3: Add `findMostRecentTodo` to todo repository

**Files:**
- Modify: `lib/repositories/todo.repository.ts`
- Modify: `lib/repositories/__tests__/todo.repository.test.ts`

- [ ] **Step 1: Write failing test**

Add to `lib/repositories/__tests__/todo.repository.test.ts`:

```typescript
it("finds most recent todo excluding given id", async () => {
  const mockTodo = {
    id: "prev-1",
    title: "previous task",
    completed: false,
    deletedAt: null,
    createdAt: new Date("2026-01-02"),
    updatedAt: new Date("2026-01-02"),
    userId: "user-1",
  };
  (prisma.todo.findFirst as Mock).mockResolvedValue(mockTodo);

  const result = await todoRepository.findMostRecentTodo("user-1", "current-1");

  expect(prisma.todo.findFirst).toHaveBeenCalledWith({
    where: {
      userId: "user-1",
      id: { not: "current-1" },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  expect(result).toEqual(mockTodo);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/repositories/__tests__/todo.repository.test.ts -t "finds most recent"`
Expected: FAIL — `todoRepository.findMostRecentTodo is not a function`

- [ ] **Step 3: Add `findMostRecentTodo` to repository**

Add to `lib/repositories/todo.repository.ts`:

```typescript
async findMostRecentTodo(userId: string, excludeId: string): Promise<Todo | null> {
  return prisma.todo.findFirst({
    where: {
      userId,
      id: { not: excludeId },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
},
```

Also add `findFirst` to the mock in the test file:
```typescript
findFirst: vi.fn(),
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/repositories/__tests__/todo.repository.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/todo.repository.ts lib/repositories/__tests__/todo.repository.test.ts
git commit -m "feat: add findMostRecentTodo to todo repository"
```

---

### Task 4: Prediction Repository

**Files:**
- Create: `lib/repositories/prediction.repository.ts`
- Create: `lib/repositories/__tests__/prediction.repository.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/repositories/__tests__/prediction.repository.test.ts`:

```typescript
import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pattern: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    termDf: {
      upsert: vi.fn(),
    },
    cluster: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    temporalPattern: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    transition: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("predictionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a pattern", async () => {
    const mockPattern = {
      id: "pat-1",
      userId: "user-1",
      titleHash: "abc123",
      rawTitle: "buy groceries",
      frequency: 1,
      clusterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (prisma.pattern.upsert as Mock).mockResolvedValue(mockPattern);

    const result = await predictionRepository.upsertPattern("user-1", "abc123", "buy groceries");

    expect(prisma.pattern.upsert).toHaveBeenCalledWith({
      where: { userId_titleHash: { userId: "user-1", titleHash: "abc123" } },
      create: { userId: "user-1", titleHash: "abc123", rawTitle: "buy groceries" },
      update: { rawTitle: "buy groceries", frequency: { increment: 1 } },
    });
    expect(result).toEqual(mockPattern);
  });

  it("upserts a term DF counter", async () => {
    const mockTermDf = { id: "td-1", userId: "user-1", term: "groceri", df: 1 };
    (prisma.termDf.upsert as Mock).mockResolvedValue(mockTermDf);

    const result = await predictionRepository.upsertTermDf("user-1", "groceri");

    expect(prisma.termDf.upsert).toHaveBeenCalledWith({
      where: { userId_term: { userId: "user-1", term: "groceri" } },
      create: { userId: "user-1", term: "groceri" },
      update: { df: { increment: 1 } },
    });
    expect(result).toEqual(mockTermDf);
  });

  it("finds clusters by userId", async () => {
    const mockClusters = [{ id: "cl-1", userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1, createdAt: new Date(), updatedAt: new Date() }];
    (prisma.cluster.findMany as Mock).mockResolvedValue(mockClusters);

    const result = await predictionRepository.findClusters("user-1");

    expect(prisma.cluster.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockClusters);
  });

  it("creates a cluster", async () => {
    const mockCluster = { id: "cl-1", userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1, createdAt: new Date(), updatedAt: new Date() };
    (prisma.cluster.create as Mock).mockResolvedValue(mockCluster);

    const result = await predictionRepository.createCluster("user-1", { groceri: 0.5 });

    expect(prisma.cluster.create).toHaveBeenCalledWith({
      data: { userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1 },
    });
    expect(result).toEqual(mockCluster);
  });

  it("updates a cluster centroid", async () => {
    const mockCluster = { id: "cl-1", userId: "user-1", centroid: { groceri: 0.6 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() };
    (prisma.cluster.update as Mock).mockResolvedValue(mockCluster);

    const result = await predictionRepository.updateClusterCentroid("cl-1", { groceri: 0.6 }, 2);

    expect(prisma.cluster.update).toHaveBeenCalledWith({
      where: { id: "cl-1" },
      data: { centroid: { groceri: 0.6 }, memberCount: 2 },
    });
    expect(result).toEqual(mockCluster);
  });

  it("updates pattern cluster assignment", async () => {
    (prisma.pattern.update as Mock).mockResolvedValue(null);

    await predictionRepository.assignPatternToCluster("pat-1", "cl-1");

    expect(prisma.pattern.update).toHaveBeenCalledWith({
      where: { id: "pat-1" },
      data: { clusterId: "cl-1" },
    });
  });

  it("upserts a temporal record", async () => {
    const mockTemporal = { id: "tp-1", patternId: "pat-1", hourBucket: 14, dayBucket: 1, weekBucket: null, count: 1 };
    (prisma.temporalPattern.upsert as Mock).mockResolvedValue(mockTemporal);

    const result = await predictionRepository.upsertTemporal("pat-1", 14, 1);

    expect(prisma.temporalPattern.upsert).toHaveBeenCalledWith({
      where: { patternId_hourBucket_dayBucket: { patternId: "pat-1", hourBucket: 14, dayBucket: 1 } },
      create: { patternId: "pat-1", hourBucket: 14, dayBucket: 1 },
      update: { count: { increment: 1 } },
    });
    expect(result).toEqual(mockTemporal);
  });

  it("finds top temporal patterns", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.temporalPattern.findMany as Mock).mockResolvedValue([{ pattern: mockPatterns[0], count: 3 }]);

    const result = await predictionRepository.findTopTemporal("user-1", 14, 1, 5);

    expect(prisma.temporalPattern.findMany).toHaveBeenCalledWith({
      where: { hourBucket: 14, dayBucket: 1, pattern: { userId: "user-1" } },
      orderBy: { count: "desc" },
      take: 5,
      include: { pattern: true },
    });
    expect(result).toHaveLength(1);
  });

  it("upserts a transition", async () => {
    const mockTransition = { id: "tr-1", userId: "user-1", fromPatternId: "pat-1", toPatternId: "pat-2", count: 1 };
    (prisma.transition.upsert as Mock).mockResolvedValue(mockTransition);

    const result = await predictionRepository.upsertTransition("user-1", "pat-1", "pat-2");

    expect(prisma.transition.upsert).toHaveBeenCalledWith({
      where: { userId_fromPatternId_toPatternId: { userId: "user-1", fromPatternId: "pat-1", toPatternId: "pat-2" } },
      create: { userId: "user-1", fromPatternId: "pat-1", toPatternId: "pat-2" },
      update: { count: { increment: 1 } },
    });
    expect(result).toEqual(mockTransition);
  });

  it("finds top transitions", async () => {
    const mockPatterns = [{ id: "pat-2", userId: "user-1", titleHash: "def", rawTitle: "cook dinner", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.transition.findMany as Mock).mockResolvedValue([{ toPattern: mockPatterns[0], count: 2 }]);

    const result = await predictionRepository.findTopTransitions("user-1", "pat-1", 5);

    expect(prisma.transition.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", fromPatternId: "pat-1" },
      orderBy: { count: "desc" },
      take: 5,
      include: { toPattern: true },
    });
    expect(result).toHaveLength(1);
  });

  it("finds patterns by cluster", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.pattern.findMany as Mock).mockResolvedValue(mockPatterns);

    const result = await predictionRepository.findPatternsByCluster("cl-1", 5);

    expect(prisma.pattern.findMany).toHaveBeenCalledWith({
      where: { clusterId: "cl-1" },
      orderBy: { frequency: "desc" },
      take: 5,
    });
    expect(result).toEqual(mockPatterns);
  });

  it("finds a pattern by id", async () => {
    const mockPattern = { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() };
    (prisma.pattern.findFirst as Mock).mockResolvedValue(mockPattern);

    const result = await predictionRepository.findPatternById("pat-1");

    expect(prisma.pattern.findFirst).toHaveBeenCalledWith({ where: { id: "pat-1" } });
    expect(result).toEqual(mockPattern);
  });

  it("finds clusters with recent patterns", async () => {
    const mockClusters = [{ id: "cl-1", userId: "user-1", centroid: {}, memberCount: 1, createdAt: new Date(), updatedAt: new Date() }];
    (prisma.cluster.findMany as Mock).mockResolvedValue(mockClusters);

    const result = await predictionRepository.findClustersWithRecentPatterns("user-1", "cl-1", new Date("2026-05-24"));

    expect(prisma.cluster.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { not: "cl-1" },
        patterns: { some: { createdAt: { gte: new Date("2026-05-24") } } },
      },
    });
    expect(result).toEqual(mockClusters);
  });

  it("gets all patterns for a user", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.pattern.findMany as Mock).mockResolvedValue(mockPatterns);

    const result = await predictionRepository.getAllPatterns("user-1");

    expect(prisma.pattern.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockPatterns);
  });

  it("gets term DFs for a user", async () => {
    const mockTerms = [{ id: "td-1", userId: "user-1", term: "groceri", df: 5 }];
    (prisma.termDf.findMany as Mock).mockResolvedValue(mockTerms);

    const result = await predictionRepository.getTermDfs("user-1");

    expect(prisma.termDf.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockTerms);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/repositories/__tests__/prediction.repository.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write prediction repository**

Create `lib/repositories/prediction.repository.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { Pattern, Cluster, TermDf, Transition } from "@/lib/types";

export const predictionRepository = {
  // Pattern
  async upsertPattern(userId: string, titleHash: string, rawTitle: string): Promise<Pattern> {
    return prisma.pattern.upsert({
      where: { userId_titleHash: { userId, titleHash } },
      create: { userId, titleHash, rawTitle },
      update: { rawTitle, frequency: { increment: 1 } },
    });
  },

  async findPatternById(id: string): Promise<Pattern | null> {
    return prisma.pattern.findFirst({ where: { id } });
  },

  async findPatternsByCluster(clusterId: string, limit: number): Promise<Pattern[]> {
    return prisma.pattern.findMany({
      where: { clusterId },
      orderBy: { frequency: "desc" },
      take: limit,
    });
  },

  async getAllPatterns(userId: string): Promise<Pattern[]> {
    return prisma.pattern.findMany({ where: { userId } });
  },

  // Term DF
  async upsertTermDf(userId: string, term: string): Promise<TermDf> {
    return prisma.termDf.upsert({
      where: { userId_term: { userId, term } },
      create: { userId, term },
      update: { df: { increment: 1 } },
    });
  },

  async getTermDfs(userId: string): Promise<TermDf[]> {
    return prisma.termDf.findMany({ where: { userId } });
  },

  // Cluster
  async findClusters(userId: string): Promise<Cluster[]> {
    return prisma.cluster.findMany({ where: { userId } });
  },

  async createCluster(userId: string, centroid: Record<string, number>): Promise<Cluster> {
    return prisma.cluster.create({
      data: { userId, centroid, memberCount: 1 },
    });
  },

  async updateClusterCentroid(clusterId: string, centroid: Record<string, number>, memberCount: number): Promise<Cluster> {
    return prisma.cluster.update({
      where: { id: clusterId },
      data: { centroid, memberCount },
    });
  },

  async assignPatternToCluster(patternId: string, clusterId: string): Promise<void> {
    await prisma.pattern.update({
      where: { id: patternId },
      data: { clusterId },
    });
  },

  async findClustersWithRecentPatterns(userId: string, excludeClusterId: string, since: Date): Promise<Cluster[]> {
    return prisma.cluster.findMany({
      where: {
        userId,
        id: { not: excludeClusterId },
        patterns: { some: { createdAt: { gte: since } } },
      },
    });
  },

  // Temporal
  async upsertTemporal(patternId: string, hourBucket: number, dayBucket: number): Promise<void> {
    await prisma.temporalPattern.upsert({
      where: { patternId_hourBucket_dayBucket: { patternId, hourBucket, dayBucket } },
      create: { patternId, hourBucket, dayBucket },
      update: { count: { increment: 1 } },
    });
  },

  async findTopTemporal(userId: string, hourBucket: number, dayBucket: number, limit: number): Promise<{ pattern: Pattern; count: number }[]> {
    const results = await prisma.temporalPattern.findMany({
      where: { hourBucket, dayBucket, pattern: { userId } },
      orderBy: { count: "desc" },
      take: limit,
      include: { pattern: true },
    });
    return results.map((r) => ({ pattern: r.pattern, count: r.count }));
  },

  // Transition
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/repositories/__tests__/prediction.repository.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/prediction.repository.ts lib/repositories/__tests__/prediction.repository.test.ts
git commit -m "feat: add prediction repository"
```

---

### Task 5: Pattern Service — normalize title, upsert pattern

**Files:**
- Create: `lib/services/pattern.service.ts`
- Create: `lib/services/__tests__/pattern.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/services/__tests__/pattern.service.test.ts`:

```typescript
import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    upsertPattern: vi.fn(),
  },
}));

import { patternService } from "@/lib/services/pattern.service";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "to", "for", "of", "in", "on",
  "and", "or", "at", "by", "with", "from", "do", "did", "does",
  "buy", "get", "make", "go", "have", "be", "not", "up", "out",
]);

function simpleStem(word: string): string {
  return word.replace(/ing$/, "").replace(/ed$/, "").replace(/s$/, "").replace(/ies$/, "i");
}

describe("patternService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes a title", () => {
    const result = patternService.normalizeTitle("Buy Groceries 🥬!!");
    expect(result.hash).toBeDefined();
    expect(result.terms).toEqual(expect.arrayContaining(["groceries"]));
    expect(result.stemmedTerms).toEqual(expect.arrayContaining(["groceri"]));
    expect(result.terms).not.toContain("buy");
  });

  it("removes stop words and stems terms", () => {
    const result = patternService.normalizeTitle("buy groceries and milk");
    expect(result.terms).not.toContain("buy");
    expect(result.terms).not.toContain("and");
    expect(result.terms).toEqual(expect.arrayContaining(["groceries", "milk"]));
  });

  it("generates a consistent hash for same title", () => {
    const a = patternService.normalizeTitle("Buy groceries");
    const b = patternService.normalizeTitle("buy groceries");
    expect(a.hash).toBe(b.hash);
  });

  it("generates different hashes for different titles", () => {
    const a = patternService.normalizeTitle("buy groceries");
    const b = patternService.normalizeTitle("buy milk");
    expect(a.hash).not.toBe(b.hash);
  });

  it("handles empty title gracefully", () => {
    const result = patternService.normalizeTitle("");
    expect(result.hash).toBeDefined();
    expect(result.terms).toEqual([]);
  });

  it("upserts pattern via repository", async () => {
    const mockPattern = { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() };
    const { predictionRepository } = await import("@/lib/repositories/prediction.repository");
    (predictionRepository.upsertPattern as Mock).mockResolvedValue(mockPattern);

    const normalized = patternService.normalizeTitle("buy groceries");
    const result = await patternService.upsertPattern("user-1", "buy groceries");

    expect(predictionRepository.upsertPattern).toHaveBeenCalledWith("user-1", normalized.hash, "buy groceries");
    expect(result).toEqual(mockPattern);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/services/__tests__/pattern.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write pattern service**

Create `lib/services/pattern.service.ts`:

```typescript
import { createHash } from "node:crypto";
import { predictionRepository } from "@/lib/repositories/prediction.repository";
import { NormalizedTitle, Pattern } from "@/lib/types";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "to", "for", "of", "in", "on",
  "and", "or", "at", "by", "with", "from", "do", "did", "does",
  "buy", "get", "make", "go", "have", "be", "not", "up", "out",
]);

function simpleStem(word: string): string {
  return word
    .replace(/ies$/, "i")
    .replace(/ing$/, "")
    .replace(/ed$/, "")
    .replace(/s$/, "");
}

export const patternService = {
  normalizeTitle(title: string): NormalizedTitle {
    const cleaned = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();

    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const terms = tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 0);
    const stemmedTerms = [...new Set(terms.map(simpleStem).filter(Boolean))].sort();

    const hash = createHash("sha256").update(stemmedTerms.join(",") || title).digest("hex").slice(0, 16);

    return { hash, terms: [...new Set(terms)], stemmedTerms };
  },

  async upsertPattern(userId: string, rawTitle: string): Promise<Pattern> {
    const { hash } = this.normalizeTitle(rawTitle);
    return predictionRepository.upsertPattern(userId, hash, rawTitle);
  },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/services/__tests__/pattern.service.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/pattern.service.ts lib/services/__tests__/pattern.service.test.ts
git commit -m "feat: add pattern service with normalization"
```

---

### Task 6: TF-IDF Service — DF update, cluster assignment

**Files:**
- Create: `lib/services/tfidf.service.ts`
- Create: `lib/services/__tests__/tfidf.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/services/__tests__/tfidf.service.test.ts`:

```typescript
import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    upsertTermDf: vi.fn(),
    getTermDfs: vi.fn(),
    findClusters: vi.fn(),
    createCluster: vi.fn(),
    updateClusterCentroid: vi.fn(),
    assignPatternToCluster: vi.fn(),
    getAllPatterns: vi.fn(),
  },
}));

import { tfidfService } from "@/lib/services/tfidf.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("tfidfService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates DF counters for each term", async () => {
    await tfidfService.updateTermDf("user-1", ["groceri", "milk"]);

    expect(predictionRepository.upsertTermDf).toHaveBeenCalledWith("user-1", "groceri");
    expect(predictionRepository.upsertTermDf).toHaveBeenCalledWith("user-1", "milk");
  });

  it("computes TF-IDF vector for a pattern", async () => {
    (predictionRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 3 },
      { id: "2", userId: "user-1", term: "milk", df: 1 },
      { id: "3", userId: "user-1", term: "cook", df: 5 },
    ]);
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(
      Array(10).fill(null).map((_, i) => ({ id: `p-${i}` }))
    );

    const vector = await tfidfService.computeTfIdf("user-1", ["groceri", "milk"]);

    expect(vector).toHaveProperty("groceri");
    expect(vector).toHaveProperty("milk");
    expect(vector.groceri).toBeLessThan(vector.milk);
  });

  it("assigns to existing cluster when similarity exceeds threshold", async () => {
    (predictionRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { groceri: 0.5, milk: 0.3 }, memberCount: 2 },
    ]);
    (predictionRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 2 },
      { id: "2", userId: "user-1", term: "milk", df: 1 },
    ]);
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(Array(5).fill({ id: "p" }));
    (predictionRepository.updateClusterCentroid as Mock).mockResolvedValue({});

    const clusterId = await tfidfService.assignToCluster("user-1", "pat-1", ["groceri", "milk"]);

    expect(clusterId).toBe("cl-1");
    expect(predictionRepository.assignPatternToCluster).toHaveBeenCalledWith("pat-1", "cl-1");
  });

  it("creates new cluster when no match exceeds threshold", async () => {
    (predictionRepository.findClusters as Mock).mockResolvedValue([
      { id: "cl-1", userId: "user-1", centroid: { cook: 0.5 }, memberCount: 1 },
    ]);
    (predictionRepository.getTermDfs as Mock).mockResolvedValue([
      { id: "1", userId: "user-1", term: "groceri", df: 1 },
    ]);
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(Array(5).fill({ id: "p" }));
    (predictionRepository.createCluster as Mock).mockResolvedValue({ id: "cl-2" });

    const clusterId = await tfidfService.assignToCluster("user-1", "pat-1", ["groceri"]);

    expect(clusterId).toBe("cl-2");
    expect(predictionRepository.createCluster).toHaveBeenCalled();
    expect(predictionRepository.assignPatternToCluster).toHaveBeenCalledWith("pat-1", "cl-2");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/services/__tests__/tfidf.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write TF-IDF service**

Create `lib/services/tfidf.service.ts`:

```typescript
import { predictionRepository } from "@/lib/repositories/prediction.repository";

const CLUSTER_SIMILARITY_THRESHOLD = 0.6;

export const tfidfService = {
  async updateTermDf(userId: string, stemmedTerms: string[]): Promise<void> {
    for (const term of stemmedTerms) {
      await predictionRepository.upsertTermDf(userId, term);
    }
  },

  async computeTfIdf(userId: string, stemmedTerms: string[]): Promise<Record<string, number>> {
    const termDfs = await predictionRepository.getTermDfs(userId);
    const dfMap = new Map(termDfs.map((t) => [t.term, t.df]));
    const allPatterns = await predictionRepository.getAllPatterns(userId);
    const totalPatterns = allPatterns.length || 1;

    const vector: Record<string, number> = {};
    const docLength = stemmedTerms.length || 1;

    for (const term of stemmedTerms) {
      const tf = stemmedTerms.filter((t) => t === term).length / docLength;
      const df = dfMap.get(term) || 1;
      const idf = Math.log(totalPatterns / df);
      vector[term] = tf * idf;
    }

    return vector;
  },

  async assignToCluster(userId: string, patternId: string, stemmedTerms: string[]): Promise<string> {
    const vector = await this.computeTfIdf(userId, stemmedTerms);
    const clusters = await predictionRepository.findClusters(userId);

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
      const centroid = clusters.find((c) => c.id === bestClusterId)!.centroid as Record<string, number>;
      const newCount = (clusters.find((c) => c.id === bestClusterId)!.memberCount ?? 1) + 1;
      const newCentroid: Record<string, number> = {};
      for (const term of new Set([...Object.keys(centroid), ...Object.keys(vector)])) {
        const oldW = centroid[term] ?? 0;
        const newW = vector[term] ?? 0;
        newCentroid[term] = oldW + (newW - oldW) / newCount;
      }
      await predictionRepository.updateClusterCentroid(bestClusterId, newCentroid, newCount);
      await predictionRepository.assignPatternToCluster(patternId, bestClusterId);
      return bestClusterId;
    }

    const cluster = await predictionRepository.createCluster(userId, vector);
    await predictionRepository.assignPatternToCluster(patternId, cluster.id);
    return cluster.id;
  },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/services/__tests__/tfidf.service.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/tfidf.service.ts lib/services/__tests__/tfidf.service.test.ts
git commit -m "feat: add TF-IDF service with cluster assignment"
```

---

### Task 7: Temporal Service — time bucket recording and querying

**Files:**
- Create: `lib/services/temporal.service.ts`
- Create: `lib/services/__tests__/temporal.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/services/__tests__/temporal.service.test.ts`:

```typescript
import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    upsertTemporal: vi.fn(),
    findTopTemporal: vi.fn(),
  },
}));

import { temporalService } from "@/lib/services/temporal.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("temporalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records time with correct hour and day buckets", async () => {
    const date = new Date("2026-05-25T14:30:00Z");
    await temporalService.recordTime("pat-1", date);

    expect(predictionRepository.upsertTemporal).toHaveBeenCalledWith("pat-1", 14, 0);
  });

  it("finds top patterns for a time slot", async () => {
    const mockResult = [{ pattern: { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }, count: 3 }];
    (predictionRepository.findTopTemporal as Mock).mockResolvedValue(mockResult);

    const date = new Date("2026-05-25T09:00:00Z");
    const result = await temporalService.getTopForTimeSlot("user-1", date, 3);

    expect(predictionRepository.findTopTemporal).toHaveBeenCalledWith("user-1", 9, 0, 3);
    expect(result).toEqual(mockResult);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/services/__tests__/temporal.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write temporal service**

Create `lib/services/temporal.service.ts`:

```typescript
import { predictionRepository } from "@/lib/repositories/prediction.repository";
import { Pattern } from "@/lib/types";

export const temporalService = {
  getDayBucket(date: Date): number {
    return date.getUTCDay();
  },

  getHourBucket(date: Date): number {
    return date.getUTCHours();
  },

  async recordTime(patternId: string, date: Date): Promise<void> {
    const hourBucket = this.getHourBucket(date);
    const dayBucket = this.getDayBucket(date);
    await predictionRepository.upsertTemporal(patternId, hourBucket, dayBucket);
  },

  async getTopForTimeSlot(userId: string, date: Date, limit: number): Promise<{ pattern: Pattern; count: number }[]> {
    const hourBucket = this.getHourBucket(date);
    const dayBucket = this.getDayBucket(date);
    return predictionRepository.findTopTemporal(userId, hourBucket, dayBucket, limit);
  },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/services/__tests__/temporal.service.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/temporal.service.ts lib/services/__tests__/temporal.service.test.ts
git commit -m "feat: add temporal service for time-bucket recording"
```

---

### Task 8: Transition Service — sequence tracking

**Files:**
- Create: `lib/services/transition.service.ts`
- Create: `lib/services/__tests__/transition.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/services/__tests__/transition.service.test.ts`:

```typescript
import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    upsertTransition: vi.fn(),
    findTopTransitions: vi.fn(),
  },
}));

import { transitionService } from "@/lib/services/transition.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("transitionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a transition between two patterns", async () => {
    await transitionService.recordTransition("user-1", "pat-1", "pat-2");

    expect(predictionRepository.upsertTransition).toHaveBeenCalledWith("user-1", "pat-1", "pat-2");
  });

  it("finds top follow-up patterns", async () => {
    const mockResult = [{ toPattern: { id: "pat-2", userId: "user-1", titleHash: "def", rawTitle: "cook dinner", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }, count: 2 }];
    (predictionRepository.findTopTransitions as Mock).mockResolvedValue(mockResult);

    const result = await transitionService.getTopFollowUps("user-1", "pat-1", 3);

    expect(predictionRepository.findTopTransitions).toHaveBeenCalledWith("user-1", "pat-1", 3);
    expect(result).toEqual(mockResult);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/services/__tests__/transition.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write transition service**

Create `lib/services/transition.service.ts`:

```typescript
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/services/__tests__/transition.service.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/transition.service.ts lib/services/__tests__/transition.service.test.ts
git commit -m "feat: add transition service for sequence tracking"
```

---

### Task 9: Prediction Service — blend engine

**Files:**
- Create: `lib/services/prediction.service.ts`
- Create: `lib/services/__tests__/prediction.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/services/__tests__/prediction.service.test.ts`:

```typescript
import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    findPatternById: vi.fn(),
    findPatternsByCluster: vi.fn(),
  },
}));

vi.mock("@/lib/services/temporal.service", () => ({
  temporalService: {
    getTopForTimeSlot: vi.fn(),
  },
}));

vi.mock("@/lib/services/transition.service", () => ({
  transitionService: {
    getTopFollowUps: vi.fn(),
  },
}));

import { predictionService } from "@/lib/services/prediction.service";
import { temporalService } from "@/lib/services/temporal.service";
import { transitionService } from "@/lib/services/transition.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("predictionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns blended predictions from all three signals", async () => {
    const mockPattern = { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() };

    (temporalService.getTopForTimeSlot as Mock).mockResolvedValue([
      { pattern: { ...mockPattern, id: "temporal-1", rawTitle: "temporal task" }, count: 3 },
    ]);
    (transitionService.getTopFollowUps as Mock).mockResolvedValue([
      { toPattern: { ...mockPattern, id: "seq-1", rawTitle: "sequential task" }, count: 2 },
    ]);
    (predictionRepository.findPatternById as Mock).mockResolvedValue(mockPattern);
    (predictionRepository.findPatternsByCluster as Mock).mockResolvedValue([
      { ...mockPattern, id: "sem-1", rawTitle: "semantic task" },
    ]);

    const results = await predictionService.predict("user-1", {
      currentPatternId: "pat-1",
      hour: 14,
      day: 1,
    });

    expect(results).toHaveLength(3);
    expect(results[0].reason).toMatch(/temporal|sequential|semantic/i);
  });

  it("requires opt-in parameter to be true", async () => {
    const results = await predictionService.predict("user-1", {});
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/services/__tests__/prediction.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write prediction service**

Create `lib/services/prediction.service.ts`:

```typescript
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

    const sorted = [...scored.entries()]
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/services/__tests__/prediction.service.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/prediction.service.ts lib/services/__tests__/prediction.service.test.ts
git commit -m "feat: add prediction service with blended scoring"
```

---

### Task 10: Wire prediction into todo.service create

**Files:**
- Modify: `lib/services/todo.service.ts`
- Modify: `lib/services/__tests__/todo.service.test.ts`

- [ ] **Step 1: Update existing test mocks and add new test**

Add mocks at top of `lib/services/__tests__/todo.service.test.ts`:

```typescript
vi.mock("@/lib/services/pattern.service", () => ({
  patternService: {
    upsertPattern: vi.fn(),
  },
}));

vi.mock("@/lib/services/temporal.service", () => ({
  temporalService: {
    recordTime: vi.fn(),
  },
}));

vi.mock("@/lib/services/transition.service", () => ({
  transitionService: {
    recordTransition: vi.fn(),
  },
}));

vi.mock("@/lib/services/tfidf.service", () => ({
  tfidfService: {
    updateTermDf: vi.fn(),
    assignToCluster: vi.fn(),
  },
}));
```

Add test for prediction tracking in the same file:

```typescript
import { patternService } from "@/lib/services/pattern.service";
import { temporalService } from "@/lib/services/temporal.service";
import { transitionService } from "@/lib/services/transition.service";
import { tfidfService } from "@/lib/services/tfidf.service";

it("records prediction vectors on create", async () => {
  (patternService.upsertPattern as Mock).mockResolvedValue({ id: "pat-1", stemmedTerms: ["groceri"] });
  (todoRepository.createTodo as Mock).mockResolvedValue(mockTodo);
  (validateTodoInput as Mock).mockReturnValue({ valid: true });

  await todoService.createTodo({ title: "buy groceries" }, mockTodo.userId);

  expect(patternService.upsertPattern).toHaveBeenCalledWith("user-1", mockTodo.title);
  expect(temporalService.recordTime).toHaveBeenCalledWith("pat-1", expect.any(Date));
  expect(tfidfService.updateTermDf).toHaveBeenCalledWith("user-1", ["groceri"]);
  expect(tfidfService.assignToCluster).toHaveBeenCalledWith("user-1", "pat-1", ["groceri"]);
});
```

- [ ] **Step 2: Run to see it fail (missing mocks cause failure or missing logic)**

Run: `npx vitest run lib/services/__tests__/todo.service.test.ts -t "records prediction vectors"`
Expected: FAIL or assertion failure

- [ ] **Step 3: Wire prediction tracking into todo.service.createTodo**

Modify `lib/services/todo.service.ts` — add imports and update createTodo:

```typescript
import { patternService } from "./pattern.service";
import { temporalService } from "./temporal.service";
import { transitionService } from "./transition.service";
import { tfidfService } from "./tfidf.service";
import { todoRepository } from "@/lib/repositories/todo.repository";

async createTodo(input: CreateTodoInput, userId: string): Promise<ApiResponse<Todo>> {
    const validation = validateTodoInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const todo = await todoRepository.createTodo(input, userId);
    cacheService.invalidate(`todos:${userId}`);

    const pattern = await patternService.upsertPattern(userId, todo.title);
    await temporalService.recordTime(pattern.id, todo.createdAt);
    const { stemmedTerms } = patternService.normalizeTitle(todo.title);
    await tfidfService.updateTermDf(userId, stemmedTerms);
    await tfidfService.assignToCluster(userId, pattern.id, stemmedTerms);

    const previous = await todoRepository.findMostRecentTodo(userId, todo.id);
    if (previous) {
      const prevPattern = await patternService.upsertPattern(userId, previous.title);
      await transitionService.recordTransition(userId, prevPattern.id, pattern.id);
    }

    return { todo };
  },
```

- [ ] **Step 4: Run all todo.service tests to verify pass**

Run: `npx vitest run lib/services/__tests__/todo.service.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/todo.service.ts lib/services/__tests__/todo.service.test.ts
git commit -m "feat: wire prediction vector recording into todo creation"
```

---

### Task 11: Predictions API route

**Files:**
- Create: `app/api/predictions/route.ts`
- Modify: `lib/types.ts` (add Pattern type if missing — already added in Task 2)

- [ ] **Step 1: Write prediction API route**

Create `app/api/predictions/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { predictionService } from "@/lib/services/prediction.service";
import { patternService } from "@/lib/services/pattern.service";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const currentTodoId = searchParams.get("currentTodoId") ?? undefined;

    let currentPatternId: string | undefined;
    if (currentTodoId) {
      const pattern = await patternService.upsertPattern(session.user.id, currentTodoId);
      currentPatternId = pattern.id;
    }

    const predictions = await predictionService.predict(session.user.id, {
      currentPatternId,
    });

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { predictionService } from "@/lib/services/prediction.service";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const currentPatternId = searchParams.get("currentPatternId") ?? undefined;

    const predictions = await predictionService.predict(session.user.id, {
      currentPatternId,
    });

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add API test**

Create `app/api/__tests__/predictions.test.ts` — or better, add inline at `app/api/predictions/__tests__/route.test.ts`:

```typescript
import { Mock, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/services/prediction.service", () => ({
  predictionService: {
    predict: vi.fn(),
  },
}));

import { auth } from "@/lib/auth/config";
import { predictionService } from "@/lib/services/prediction.service";
import { GET } from "@/app/api/predictions/route";

describe("GET /api/predictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/predictions");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns predictions for authenticated user", async () => {
    (auth as Mock).mockResolvedValue({ user: { id: "user-1" } });
    (predictionService.predict as Mock).mockResolvedValue([
      { patternId: "pat-1", rawTitle: "buy groceries", score: 0.8, reason: "temporal" },
    ]);

    const req = new NextRequest("http://localhost/api/predictions");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.predictions).toHaveLength(1);
    expect(body.predictions[0].rawTitle).toBe("buy groceries");
  });

  it("passes currentPatternId when provided as query param", async () => {
    (auth as Mock).mockResolvedValue({ user: { id: "user-1" } });
    (predictionService.predict as Mock).mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/predictions?currentPatternId=pat-1");
    await GET(req);

    expect(predictionService.predict).toHaveBeenCalledWith("user-1", { currentPatternId: "pat-1" });
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add app/api/predictions/route.ts
git commit -m "feat: add predictions API endpoint"
```

---

### Task 12: Recurring Detection — core logic + API

**Files:**
- Create: `lib/services/recurring.service.ts`
- Create: `lib/services/__tests__/recurring.service.test.ts`
- Create: `app/api/patterns/recurring/route.ts`

- [ ] **Step 1: Write failing test**

Create `lib/services/__tests__/recurring.service.test.ts`:

```typescript
import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/prediction.repository", () => ({
  predictionRepository: {
    getAllPatterns: vi.fn(),
  },
}));

import { recurringService } from "@/lib/services/recurring.service";
import { predictionRepository } from "@/lib/repositories/prediction.repository";

describe("recurringService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns patterns with frequency >= 3 as recurring candidates", async () => {
    const patterns = [
      { id: "pat-1", userId: "user-1", titleHash: "a", rawTitle: "team standup", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-2", userId: "user-1", titleHash: "b", rawTitle: "buy milk", frequency: 2, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "pat-3", userId: "user-1", titleHash: "c", rawTitle: "weekly report", frequency: 8, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue(patterns);

    const result = await recurringService.detectRecurring("user-1");

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("weekly report");
    expect(result[1].title).toBe("team standup");
  });

  it("returns empty array when no patterns have enough frequency", async () => {
    (predictionRepository.getAllPatterns as Mock).mockResolvedValue([
      { id: "pat-1", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const result = await recurringService.detectRecurring("user-1");

    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write recurring service**

Create `lib/services/recurring.service.ts`:

```typescript
import { predictionRepository } from "@/lib/repositories/prediction.repository";

export const recurringService = {
  async detectRecurring(userId: string): Promise<any[]> {
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
```

- [ ] **Step 3: Write recurring API route**

Create `app/api/patterns/recurring/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { recurringService } from "@/lib/services/recurring.service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const recurring = await recurringService.detectRecurring(session.user.id);
    return NextResponse.json({ recurring });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/recurring.service.ts lib/services/__tests__/recurring.service.test.ts app/api/patterns/recurring/route.ts
git commit -m "feat: add recurring detection service and API endpoint"
```

---

### Task 13: Verify full test suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests PASS (existing 46 tests + new prediction tests)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds
