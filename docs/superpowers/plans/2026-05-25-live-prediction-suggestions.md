# Live Prediction Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prediction suggestion list update in real-time as the user types in the todo input field using debounced queries.

**Architecture:** Extend `predictionService.predict()` with optional `query` param for substring/token matching. Wire page.tsx `inputValue` state through a 300ms debounce to `PredictionList` as a SWR query param. PredictionList moves from sidebar to below-input layout.

**Tech Stack:** Next.js 14 App Router, SWR, TypeScript, Vitest 3 (mocked)

---

### Task 1: Prediction Service — query-based filtering

**Files:**
- Modify: `lib/services/prediction.service.ts`
- Test: `lib/services/__tests__/prediction.service.test.ts`

- [ ] **Step 1: Add test for query-based prediction (substring match)**

Add to `prediction.service.test.ts`:

```typescript
it("returns matching predictions when query has substring overlap", async () => {
  const mockPatterns = [
    { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-eggs", userId: "user-1", titleHash: "c", rawTitle: "get eggs", frequency: 2, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);

  const results = await predictionService.predict("user-1", { query: "mil" });

  expect(results).toHaveLength(1);
  expect(results[0].rawTitle).toBe("buy milk");
  expect(results[0].reason).toBe("query match");
});
```

- [ ] **Step 2: Add test for query-based prediction (token intersection)**

Add after previous test:

```typescript
it("returns matching predictions from token intersection across normalized terms", async () => {
  const mockPatterns = [
    { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 5, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 3, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);

  const results = await predictionService.predict("user-1", { query: "milk" });

  expect(results).toHaveLength(1);
  expect(results[0].rawTitle).toBe("buy milk");
});
```

- [ ] **Step 3: Add test for scoring — overlapCount * 2 + frequency, sorted desc, top 5**

Add after previous test:

```typescript
it("scores by overlap count times 2 plus frequency and returns top 5 sorted descending", async () => {
  const mockPatterns = [
    { id: "pat-bread", userId: "user-1", titleHash: "b", rawTitle: "buy bread", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
    { id: "pat-milk", userId: "user-1", titleHash: "a", rawTitle: "buy milk", frequency: 10, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  (patternRepository.getAllPatterns as Mock).mockResolvedValue(mockPatterns);

  const results = await predictionService.predict("user-1", { query: "buy" });

  expect(results).toHaveLength(2);
  expect(results[0].rawTitle).toBe("buy milk");
  expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
});
```

- [ ] **Step 4: Add test for empty results when no patterns match**

Add after previous test:

```typescript
it("returns empty array when no patterns match the query", async () => {
  (patternRepository.getAllPatterns as Mock).mockResolvedValue([
    { id: "pat-bread", userId: "user-1", titleHash: "a", rawTitle: "buy bread", frequency: 1, clusterId: null, createdAt: new Date(), updatedAt: new Date() },
  ]);

  const results = await predictionService.predict("user-1", { query: "zzzzz" });

  expect(results).toEqual([]);
});
```

- [ ] **Step 5: Add test for empty query string falling back to blended predictions**

Add after previous test:

```typescript
it("falls back to blended predictions when query is empty string", async () => {
  (temporalService.getTopForTimeSlot as Mock).mockResolvedValue([]);
  (patternRepository.findMostRecentPattern as Mock).mockResolvedValue(null);

  const results = await predictionService.predict("user-1", { query: "" });

  expect(results).toEqual([]);
  expect(temporalService.getTopForTimeSlot).toHaveBeenCalled();
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/prediction.service.test.ts`
Expected: New tests FAIL with "TypeError: ... is not a function" or similar

- [ ] **Step 7: Implement query filtering in predictionService.predict()**

Replace `lib/services/prediction.service.ts` content with:

```typescript
import { temporalService } from "@/lib/services/temporal.service";
import { transitionService } from "@/lib/services/transition.service";
import { patternRepository } from "@/lib/repositories/pattern.repository";
import { patternService } from "@/lib/services/pattern.service";
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
  minFrequency?: number;
  query?: string;
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

    const scored = allPatterns
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
        return { patternId: pattern.id, rawTitle: pattern.rawTitle, score, reason: "query match" };
      })
      .filter((p): p is Prediction => p !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((p) => ({ ...p, score: Math.round(p.score * 100) / 100 }));

    return scored;
  },
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/prediction.service.test.ts`
Expected: All 8 tests PASS (3 old + 5 new)

- [ ] **Step 9: Commit**

```bash
git add lib/services/prediction.service.ts lib/services/__tests__/prediction.service.test.ts
git commit -m "feat: add query-based prediction filtering with substring and token matching"
```

---

### Task 2: API Route — parse query param

**Files:**
- Modify: `app/api/predictions/route.ts`
- Test: `app/api/predictions/route.test.ts` (add a simple integration test)

- [ ] **Step 1: Read the existing route to confirm current state**

- [ ] **Step 2: Add a test for the query param**

Create `app/api/predictions/__tests__/route.test.ts`:

```typescript
import { Mock, vi } from "vitest";
import { GET } from "../route";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "test-user" } }),
}));

vi.mock("@/lib/services/prediction.service", () => ({
  predictionService: {
    predict: vi.fn(),
  },
}));

import { predictionService } from "@/lib/services/prediction.service";

describe("GET /api/predictions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes query param to predictionService.predict", async () => {
    (predictionService.predict as Mock).mockResolvedValue([]);

    const request = new Request("http://localhost/api/predictions?query=milk");
    await GET(request as any);

    expect(predictionService.predict).toHaveBeenCalledWith("test-user", { query: "milk" });
  });

  it("omits query when not provided", async () => {
    (predictionService.predict as Mock).mockResolvedValue([]);

    const request = new Request("http://localhost/api/predictions");
    await GET(request as any);

    expect(predictionService.predict).toHaveBeenCalledWith("test-user", {});
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth/config");
    (auth as Mock).mockResolvedValue(null);

    const request = new Request("http://localhost/api/predictions");
    const response = await GET(request as any);

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/predictions/__tests__/route.test.ts`
Expected: FAIL — route doesn't parse query param yet

- [ ] **Step 4: Modify route to parse and pass query param**

Replace `app/api/predictions/route.ts` content with:

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
    const minFrequency = searchParams.get("minFrequency") ? Number(searchParams.get("minFrequency")) : undefined;
    const query = searchParams.get("query") ?? undefined;

    const predictions = await predictionService.predict(session.user.id, {
      currentPatternId,
      minFrequency,
      query,
    });

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/predictions/__tests__/route.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/predictions/route.ts app/api/predictions/__tests__/route.test.ts
git commit -m "feat: parse query param in GET /api/predictions route"
```

---

### Task 3: TodoForm — add onInputChange prop

**Files:**
- Modify: `components/TodoForm.tsx`

- [ ] **Step 1: Add onInputChange prop and call on keystroke**

Replace `components/TodoForm.tsx` content with:

```typescript
"use client";

import { useState } from "react";

interface TodoFormProps {
  onSubmit: (title: string) => void;
  onInputChange?: (value: string) => void;
}

export function TodoForm({ onSubmit, onInputChange }: TodoFormProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSubmit(title.trim());
      setTitle("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
      <input
        type="text"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          onInputChange?.(e.target.value);
        }}
        placeholder="Add a new todo..."
        maxLength={200}
        className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Add
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TodoForm.tsx
git commit -m "feat: add onInputChange prop to TodoForm"
```

---

### Task 4: PredictionList — accept query prop, empty states, layout change

**Files:**
- Modify: `components/PredictionList.tsx`

- [ ] **Step 1: Modify PredictionList to accept query prop and handle empty states**

Replace `components/PredictionList.tsx` content with:

```typescript
"use client";

import useSWR from "swr";
import { Prediction } from "@/lib/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

interface PredictionListProps {
  onCreateTodo: (title: string) => Promise<void>;
  query?: string;
}

export function PredictionList({ onCreateTodo, query }: PredictionListProps) {
  const swrKey = query ? `/api/predictions?query=${encodeURIComponent(query)}` : "/api/predictions";
  const { data, error } = useSWR<{ predictions: Prediction[] }>(swrKey, fetcher);

  if (error) return null;
  if (!data) return null;

  if (!data.predictions?.length) {
    if (query) {
      return (
        <div className="text-sm text-gray-400 italic mb-4">
          No matching suggestions
        </div>
      );
    }
    return (
      <div className="text-sm text-gray-400 italic mb-4">
        Create a few todos to see suggestions
      </div>
    );
  }

  return (
    <div className="mb-4">
      <ul className="flex flex-wrap gap-2">
        {data.predictions.map((p) => (
          <li key={p.patternId}>
            <button
              onClick={() => onCreateTodo(p.rawTitle)}
              className="text-sm px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              title={`${p.rawTitle} (${p.reason})`}
            >
            {p.rawTitle}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/PredictionList.tsx
git commit -m "feat: accept query prop, add empty states, pill-style layout"
```

---

### Task 5: Page — inputValue state, debounce, layout, predictions mutation

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Rewrite page.tsx with input state, debounce, new layout, predictions mutation**

Replace `app/page.tsx` content with:

```typescript
"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { useSession, signOut } from "next-auth/react";
import { Todo } from "@/lib/types";
import { TodoForm } from "@/components/TodoForm";
import { TodoList } from "@/components/TodoList";
import { PredictionList } from "@/components/PredictionList";
import { AuthGuard } from "@/components/AuthGuard";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

function HomeContent() {
  const { data: session } = useSession();
  const { data, error, mutate } = useSWR<{ todos: Todo[] }>("/api/todos", fetcher);
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleCreate = async (title: string) => {
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    mutate();
    mutate("/api/predictions");
    setInputValue("");
    setDebouncedQuery("");
  };

  const handleToggle = async (id: string) => {
    const todo = data?.todos?.find((t) => t.id === id);
    if (!todo) return;

    await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    });
    mutate();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    mutate();
  };

  if (error) return <div className="text-center text-red-500 py-8">Failed to load todos.</div>;
  if (!data) return <div className="text-center py-8">Loading...</div>;

  return (
    <main className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">TODO App</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{session?.user?.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-red-500 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
      <div>
        <TodoForm onSubmit={handleCreate} onInputChange={setInputValue} />
        <PredictionList onCreateTodo={handleCreate} query={debouncedQuery} />
        <TodoList todos={data.todos} onToggle={handleToggle} onDelete={handleDelete} />
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add input debounce, predictions mutation, and below-input layout"
```

---

### Task 6: Self-review — run existing tests to verify no regressions

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All existing tests PASS (no regressions)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no type errors
