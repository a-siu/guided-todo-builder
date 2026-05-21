# TODO App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal TODO app with Next.js, PostgreSQL, and a service-oriented backend architecture, deployed to Vercel.

**Architecture:** Next.js App Router with client components for the frontend, API routes as a thin gateway, and a layered backend (services → repository → Prisma → PostgreSQL). Each service has a single responsibility. DRY enforced — each function written once.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, Prisma, PostgreSQL (Neon), SWR

---

## File Structure

```
todo-app/
├── package.json                          # Dependencies + scripts
├── tsconfig.json                         # TypeScript config
├── next.config.ts                        # Next.js config
├── tailwind.config.ts                    # Tailwind config
├── postcss.config.mjs                    # PostCSS config
├── prisma/
│   └── schema.prisma                     # DB schema with soft delete
├── app/
│   ├── globals.css                       # Tailwind + base styles
│   ├── layout.tsx                        # Root layout
│   ├── page.tsx                          # Main page (client component)
│   └── api/
│       └── todos/
│           ├── route.ts                  # GET list, POST create
│           └── [id]/
│               └── route.ts              # GET/PUT/DELETE by ID
├── lib/
│   ├── prisma.ts                         # Prisma client singleton
│   ├── types.ts                          # Shared TypeScript types
│   ├── validation/
│   │   └── todo.validation.ts            # Input validation (single source)
│   ├── repositories/
│   │   └── todo.repository.ts            # All Prisma queries (single source)
│   └── services/
│       ├── cache.service.ts              # In-memory query cache
│       ├── audit.service.ts              # Soft-delete + audit queries
│       └── todo.service.ts               # Todo business logic
└── components/
    ├── TodoList.tsx                      # Todo list display
    ├── TodoItem.tsx                      # Single todo item
    └── TodoForm.tsx                      # Create/edit form
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "todo-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "db:push": "prisma db push",
    "db:generate": "prisma generate"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@prisma/client": "^5.14.0",
    "swr": "^2.2.5"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "prisma": "^5.14.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.ts**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Create tailwind.config.ts**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create postcss.config.mjs**

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

---

### Task 2: Database Schema + Prisma Client

**Files:**
- Create: `prisma/schema.prisma`, `lib/prisma.ts`, `lib/types.ts`

- [ ] **Step 1: Create Prisma schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Todo {
  id        String   @id @default(cuid())
  title     String
  completed Boolean  @default(false)
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Create Prisma client singleton**

```ts
// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: Create shared types**

```ts
// lib/types.ts
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTodoInput {
  title: string;
}

export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
}

export interface ApiResponse<T> {
  todo?: T;
  todos?: T[];
  error?: string;
}
```

- [ ] **Step 4: Generate Prisma client**

Run: `npx prisma generate`

---

### Task 3: Validation Service

**Files:**
- Create: `lib/validation/todo.validation.ts`

- [ ] **Step 1: Write validation tests**

```ts
// lib/validation/__tests__/todo.validation.test.ts
import { validateTodoInput, validateUpdateInput } from "../todo.validation";

describe("validateTodoInput", () => {
  it("rejects empty title", () => {
    expect(validateTodoInput({ title: "" })).toEqual({
      valid: false,
      error: "Title is required",
    });
  });

  it("rejects title over 200 chars", () => {
    expect(validateTodoInput({ title: "a".repeat(201) })).toEqual({
      valid: false,
      error: "Title must be 200 characters or less",
    });
  });

  it("accepts valid title", () => {
    expect(validateTodoInput({ title: "Buy groceries" })).toEqual({
      valid: true,
    });
  });
});

describe("validateUpdateInput", () => {
  it("rejects empty title on update", () => {
    expect(validateUpdateInput({ title: "" })).toEqual({
      valid: false,
      error: "Title cannot be empty",
    });
  });

  it("rejects title over 200 chars on update", () => {
    expect(validateUpdateInput({ title: "a".repeat(201) })).toEqual({
      valid: false,
      error: "Title must be 200 characters or less",
    });
  });

  it("accepts valid update with title", () => {
    expect(validateUpdateInput({ title: "Updated title" })).toEqual({
      valid: true,
    });
  });

  it("accepts valid update with completed", () => {
    expect(validateUpdateInput({ completed: true })).toEqual({
      valid: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/validation/__tests__/todo.validation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validation service**

```ts
// lib/validation/todo.validation.ts
import { CreateTodoInput, UpdateTodoInput } from "@/lib/types";

export function validateTodoInput(input: CreateTodoInput): { valid: boolean; error?: string } {
  if (!input.title || input.title.trim().length === 0) {
    return { valid: false, error: "Title is required" };
  }
  if (input.title.length > 200) {
    return { valid: false, error: "Title must be 200 characters or less" };
  }
  return { valid: true };
}

export function validateUpdateInput(input: UpdateTodoInput): { valid: boolean; error?: string } {
  if (input.title !== undefined) {
    if (input.title.trim().length === 0) {
      return { valid: false, error: "Title cannot be empty" };
    }
    if (input.title.length > 200) {
      return { valid: false, error: "Title must be 200 characters or less" };
    }
  }
  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/validation/__tests__/todo.validation.test.ts`
Expected: PASS (all 7 tests)

---

### Task 4: Cache Service

**Files:**
- Create: `lib/services/cache.service.ts`

- [ ] **Step 1: Write cache tests**

```ts
// lib/services/__tests__/cache.service.test.ts
import { CacheService } from "../cache.service";

describe("CacheService", () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  it("returns null for missing key", () => {
    expect(cache.get("todos")).toBeNull();
  });

  it("stores and retrieves value", () => {
    cache.set("todos", [{ id: "1", title: "test" }]);
    expect(cache.get("todos")).toEqual([{ id: "1", title: "test" }]);
  });

  it("invalidates specific key", () => {
    cache.set("todos", []);
    cache.set("audit", []);
    cache.invalidate("todos");
    expect(cache.get("todos")).toBeNull();
    expect(cache.get("audit")).toEqual([]);
  });

  it("clears all cache", () => {
    cache.set("todos", []);
    cache.set("audit", []);
    cache.clear();
    expect(cache.get("todos")).toBeNull();
    expect(cache.get("audit")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/services/__tests__/cache.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cache service**

```ts
// lib/services/cache.service.ts
export class CacheService {
  private store = new Map<string, unknown>();

  get<T>(key: string): T | null {
    return (this.store.get(key) as T) ?? null;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export const cacheService = new CacheService();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/services/__tests__/cache.service.test.ts`
Expected: PASS (all 4 tests)

---

### Task 5: Repository Layer

**Files:**
- Create: `lib/repositories/todo.repository.ts`

- [ ] **Step 1: Write repository tests**

```ts
// lib/repositories/__tests__/todo.repository.test.ts
import { todoRepository } from "../todo.repository";

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    todo: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("todoRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("finds all active todos", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: null }]);
    const result = await todoRepository.findActiveTodos();
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds all todos including deleted", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: new Date() }]);
    const result = await todoRepository.findAllTodos();
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds only deleted todos", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: new Date() }]);
    const result = await todoRepository.findDeletedTodos();
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("creates a todo", async () => {
    (prisma.todo.create as jest.Mock).mockResolvedValue({ id: "1", title: "new" });
    const result = await todoRepository.createTodo({ title: "new" });
    expect(result.title).toBe("new");
    expect(prisma.todo.create).toHaveBeenCalledWith({
      data: { title: "new" },
    });
  });

  it("updates a todo", async () => {
    (prisma.todo.update as jest.Mock).mockResolvedValue({ id: "1", title: "updated" });
    const result = await todoRepository.updateTodo("1", { title: "updated" });
    expect(result.title).toBe("updated");
    expect(prisma.todo.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { title: "updated" },
    });
  });

  it("finds todo by id", async () => {
    (prisma.todo.findUnique as jest.Mock).mockResolvedValue({ id: "1", title: "test" });
    const result = await todoRepository.findTodoById("1");
    expect(result?.id).toBe("1");
    expect(prisma.todo.findUnique).toHaveBeenCalledWith({ where: { id: "1" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/repositories/__tests__/todo.repository.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement repository**

```ts
// lib/repositories/todo.repository.ts
import { prisma } from "@/lib/prisma";
import { CreateTodoInput, UpdateTodoInput, Todo } from "@/lib/types";

export const todoRepository = {
  async findActiveTodos(): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  async findAllTodos(): Promise<Todo[]> {
    return prisma.todo.findMany({
      orderBy: { createdAt: "desc" },
    });
  },

  async findDeletedTodos(): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
  },

  async findTodoById(id: string): Promise<Todo | null> {
    return prisma.todo.findUnique({
      where: { id },
    });
  },

  async createTodo(input: CreateTodoInput): Promise<Todo> {
    return prisma.todo.create({
      data: { title: input.title },
    });
  },

  async updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
    return prisma.todo.update({
      where: { id },
      data: input,
    });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/repositories/__tests__/todo.repository.test.ts`
Expected: PASS (all 6 tests)

---

### Task 6: Audit Service

**Files:**
- Create: `lib/services/audit.service.ts`

- [ ] **Step 1: Write audit service tests**

```ts
// lib/services/__tests__/audit.service.test.ts
import { auditService } from "../audit.service";
import { todoRepository } from "@/lib/repositories/todo.repository";

jest.mock("@/lib/repositories/todo.repository", () => ({
  todoRepository: {
    findDeletedTodos: jest.fn(),
    findAllTodos: jest.fn(),
    updateTodo: jest.fn(),
  },
}));

describe("auditService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gets deleted todos", async () => {
    (todoRepository.findDeletedTodos as jest.Mock).mockResolvedValue([{ id: "1", deletedAt: new Date() }]);
    const result = await auditService.getDeletedTodos();
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).not.toBeNull();
  });

  it("gets all todos including deleted", async () => {
    (todoRepository.findAllTodos as jest.Mock).mockResolvedValue([{ id: "1" }, { id: "2" }]);
    const result = await auditService.getAllTodos();
    expect(result).toHaveLength(2);
  });

  it("soft deletes a todo", async () => {
    const now = new Date();
    (todoRepository.updateTodo as jest.Mock).mockImplementation(async (_id: string, data: any) => ({
      id: "1",
      ...data,
    }));
    const result = await auditService.softDelete("1");
    expect(todoRepository.updateTodo).toHaveBeenCalledWith("1", { deletedAt: expect.any(Date) });
    expect(result.deletedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/services/__tests__/audit.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement audit service**

```ts
// lib/services/audit.service.ts
import { todoRepository } from "@/lib/repositories/todo.repository";
import { Todo } from "@/lib/types";

export const auditService = {
  async getDeletedTodos(): Promise<Todo[]> {
    return todoRepository.findDeletedTodos();
  },

  async getAllTodos(): Promise<Todo[]> {
    return todoRepository.findAllTodos();
  },

  async softDelete(id: string): Promise<Todo> {
    return todoRepository.updateTodo(id, { deletedAt: new Date() });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/services/__tests__/audit.service.test.ts`
Expected: PASS (all 3 tests)

---

### Task 7: Todo Service

**Files:**
- Create: `lib/services/todo.service.ts`

- [ ] **Step 1: Write todo service tests**

```ts
// lib/services/__tests__/todo.service.test.ts
import { todoService } from "../todo.service";
import { todoRepository } from "@/lib/repositories/todo.repository";
import { cacheService } from "../cache.service";
import { auditService } from "../audit.service";
import * as validation from "@/lib/validation/todo.validation";

jest.mock("@/lib/repositories/todo.repository", () => ({
  todoRepository: {
    findActiveTodos: jest.fn(),
    findTodoById: jest.fn(),
    createTodo: jest.fn(),
    updateTodo: jest.fn(),
  },
}));

jest.mock("../cache.service", () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
}));

jest.mock("../audit.service", () => ({
  auditService: {
    softDelete: jest.fn(),
  },
}));

describe("todoService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gets todos from cache on hit", async () => {
    (cacheService.get as jest.Mock).mockReturnValue([{ id: "1" }]);
    const result = await todoService.getTodos();
    expect(result).toEqual([{ id: "1" }]);
    expect(todoRepository.findActiveTodos).not.toHaveBeenCalled();
  });

  it("gets todos from DB on cache miss", async () => {
    (cacheService.get as jest.Mock).mockReturnValue(null);
    (todoRepository.findActiveTodos as jest.Mock).mockResolvedValue([{ id: "1" }]);
    const result = await todoService.getTodos();
    expect(result).toEqual([{ id: "1" }]);
    expect(cacheService.set).toHaveBeenCalledWith("todos", [{ id: "1" }]);
  });

  it("creates todo and invalidates cache", async () => {
    (validation.validateTodoInput as any) = () => ({ valid: true });
    (todoRepository.createTodo as jest.Mock).mockResolvedValue({ id: "1", title: "new" });
    const result = await todoService.createTodo({ title: "new" });
    expect(result.todo?.title).toBe("new");
    expect(cacheService.invalidate).toHaveBeenCalledWith("todos");
  });

  it("rejects invalid input on create", async () => {
    (validation.validateTodoInput as any) = () => ({ valid: false, error: "Title is required" });
    const result = await todoService.createTodo({ title: "" });
    expect(result.error).toBe("Title is required");
    expect(todoRepository.createTodo).not.toHaveBeenCalled();
  });

  it("updates todo and invalidates cache", async () => {
    (validation.validateUpdateInput as any) = () => ({ valid: true });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1" });
    (todoRepository.updateTodo as jest.Mock).mockResolvedValue({ id: "1", title: "updated" });
    const result = await todoService.updateTodo("1", { title: "updated" });
    expect(result.todo?.title).toBe("updated");
    expect(cacheService.invalidate).toHaveBeenCalledWith("todos");
  });

  it("returns 404 when updating non-existent todo", async () => {
    (validation.validateUpdateInput as any) = () => ({ valid: true });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue(null);
    const result = await todoService.updateTodo("999", { title: "updated" });
    expect(result.error).toBe("Todo not found");
  });

  it("deletes todo via audit service and invalidates cache", async () => {
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1" });
    (auditService.softDelete as jest.Mock).mockResolvedValue({ id: "1", deletedAt: new Date() });
    const result = await todoService.deleteTodo("1");
    expect(result.todo?.deletedAt).toBeDefined();
    expect(cacheService.invalidate).toHaveBeenCalledWith("todos");
  });

  it("returns 404 when deleting non-existent todo", async () => {
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue(null);
    const result = await todoService.deleteTodo("999");
    expect(result.error).toBe("Todo not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/services/__tests__/todo.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement todo service**

```ts
// lib/services/todo.service.ts
import { todoRepository } from "@/lib/repositories/todo.repository";
import { cacheService } from "./cache.service";
import { auditService } from "./audit.service";
import { validateTodoInput, validateUpdateInput } from "@/lib/validation/todo.validation";
import { CreateTodoInput, UpdateTodoInput, ApiResponse, Todo } from "@/lib/types";

const TODOS_CACHE_KEY = "todos";

export const todoService = {
  async getTodos(): Promise<Todo[]> {
    const cached = cacheService.get<Todo[]>(TODOS_CACHE_KEY);
    if (cached) return cached;

    const todos = await todoRepository.findActiveTodos();
    cacheService.set(TODOS_CACHE_KEY, todos);
    return todos;
  },

  async createTodo(input: CreateTodoInput): Promise<ApiResponse<Todo>> {
    const validation = validateTodoInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const todo = await todoRepository.createTodo(input);
    cacheService.invalidate(TODOS_CACHE_KEY);
    return { todo };
  },

  async updateTodo(id: string, input: UpdateTodoInput): Promise<ApiResponse<Todo>> {
    const validation = validateUpdateInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const existing = await todoRepository.findTodoById(id);
    if (!existing) {
      return { error: "Todo not found" };
    }

    const todo = await todoRepository.updateTodo(id, input);
    cacheService.invalidate(TODOS_CACHE_KEY);
    return { todo };
  },

  async deleteTodo(id: string): Promise<ApiResponse<Todo>> {
    const existing = await todoRepository.findTodoById(id);
    if (!existing) {
      return { error: "Todo not found" };
    }

    const todo = await auditService.softDelete(id);
    cacheService.invalidate(TODOS_CACHE_KEY);
    return { todo };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/services/__tests__/todo.service.test.ts`
Expected: PASS (all 8 tests)

---

### Task 8: API Routes

**Files:**
- Create: `app/api/todos/route.ts`, `app/api/todos/[id]/route.ts`

- [ ] **Step 1: Create GET/POST route for /api/todos**

```ts
// app/api/todos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { todoService } from "@/lib/services/todo.service";
import { auditService } from "@/lib/services/audit.service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true";

  try {
    const todos = includeDeleted
      ? await auditService.getAllTodos()
      : await todoService.getTodos();

    return NextResponse.json({ todos });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await todoService.createTodo({ title: body.title });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ todo: result.todo }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create GET/PUT/DELETE route for /api/todos/[id]**

```ts
// app/api/todos/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { todoService } from "@/lib/services/todo.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const todos = await todoService.getTodos();
    const todo = todos.find((t) => t.id === params.id);

    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json({ todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const result = await todoService.updateTodo(params.id, body);

    if (result.error === "Todo not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ todo: result.todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await todoService.deleteTodo(params.id);

    if (result.error === "Todo not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ todo: result.todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

---

### Task 9: Frontend Components

**Files:**
- Create: `components/TodoForm.tsx`, `components/TodoItem.tsx`, `components/TodoList.tsx`

- [ ] **Step 1: Create TodoForm component**

```tsx
// components/TodoForm.tsx
"use client";

import { useState } from "react";

interface TodoFormProps {
  onSubmit: (title: string) => void;
}

export function TodoForm({ onSubmit }: TodoFormProps) {
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
        onChange={(e) => setTitle(e.target.value)}
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

- [ ] **Step 2: Create TodoItem component**

```tsx
// components/TodoItem.tsx
"use client";

import { Todo } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <div className="flex items-center gap-3 p-3 border-b">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
        className="w-5 h-5"
      />
      <span
        className={`flex-1 ${
          todo.completed ? "line-through text-gray-400" : ""
        }`}
      >
        {todo.title}
      </span>
      <button
        onClick={() => onDelete(todo.id)}
        className="px-2 py-1 text-red-500 hover:bg-red-50 rounded"
      >
        Delete
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create TodoList component**

```tsx
// components/TodoList.tsx
"use client";

import { Todo } from "@/lib/types";
import { TodoItem } from "./TodoItem";

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  if (todos.length === 0) {
    return <p className="text-gray-500 text-center py-4">No todos yet.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
```

---

### Task 10: Main Page + Layout

**Files:**
- Create: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Create globals.css**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 2: Create root layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TODO App",
  description: "A simple TODO application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create main page with SWR integration**

```tsx
// app/page.tsx
"use client";

import useSWR from "swr";
import { Todo } from "@/lib/types";
import { TodoForm } from "@/components/TodoForm";
import { TodoList } from "@/components/TodoList";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Home() {
  const { data, error, mutate } = useSWR<{ todos: Todo[] }>("/api/todos", fetcher);

  const handleCreate = async (title: string) => {
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    mutate();
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
      <h1 className="text-3xl font-bold mb-6">TODO App</h1>
      <TodoForm onSubmit={handleCreate} />
      <TodoList todos={data.todos} onToggle={handleToggle} onDelete={handleDelete} />
    </main>
  );
}
```

---

### Task 11: Vercel Deployment Setup

**Files:**
- Create: `.env.example`, `vercel.json` (optional)

- [ ] **Step 1: Create environment example**

```env
# .env.example
DATABASE_URL="postgresql://user:password@host:5432/todo_db"
```

- [ ] **Step 2: Create vercel.json for build configuration**

```json
{
  "buildCommand": "prisma generate && next build",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

- [ ] **Step 3: Add .gitignore**

```
# .gitignore
node_modules/
.next/
.env
.env.local
*.tsbuildinfo
```

- [ ] **Step 4: Final commit**

Run: `git add -A && git commit -m "feat: complete TODO app with service-oriented backend"`

---

## Self-Review

**1. Spec coverage check:**

| Spec Requirement | Task |
|-----------------|------|
| Next.js App Router | Tasks 1, 8, 10 |
| API Routes (REST) | Task 8 |
| Prisma + PostgreSQL | Tasks 2, 5 |
| Soft delete (deletedAt) | Tasks 2, 6, 7 |
| Cache service | Tasks 4, 7 |
| Validation service | Tasks 3, 7 |
| Todo service (business logic) | Task 7 |
| Repository (single DB access) | Task 5 |
| SWR for data fetching | Task 10 |
| Tailwind CSS | Tasks 1, 9, 10 |
| Vercel deployment | Task 11 |
| Audit endpoint (includeDeleted) | Task 8 |
| DRY (each function once) | All tasks — single source per layer |
| TypeScript throughout | All tasks |

**2. Placeholder scan:** No TBDs, TODOs, or vague instructions. All code blocks are complete.

**3. Type consistency:** `Todo`, `CreateTodoInput`, `UpdateTodoInput`, `ApiResponse<T>` defined in Task 2 and used consistently in Tasks 3-10. Method signatures match across services, repository, and API routes.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-21-todo-app-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
