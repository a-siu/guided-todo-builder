# User Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password auth so each user only sees and modifies their own todos.

**Architecture:** Auth.js v5 Credentials provider wrapped in a thin service layer. Prisma schema gains User model + userId FK on Todo. UUIDv7 via Prisma middleware. Middleware protects `/api/todos/*` and `/`. Every todo query is scoped by userId at the repository level — impossible to access another user's data.

**Tech Stack:** Auth.js v5 (next-auth), bcryptjs, uuidv7, Prisma, PostgreSQL

---

## File Structure

```
CREATE:
  lib/auth/config.ts                  # Auth.js config (Credentials, JWT, callbacks)
  lib/auth/service.ts                 # authService: register, hashPassword, verifyPassword
  lib/validation/auth.validation.ts   # Register/login input validation
  lib/repositories/user.repository.ts # Prisma queries for User model
  app/api/auth/[...nextauth]/route.ts # Auth.js handler (sign in, sign out, session)
  app/api/auth/register/route.ts      # POST /api/auth/register
  app/providers.tsx                   # SessionProvider wrapper (client component)
  app/(auth)/login/page.tsx           # Login page
  app/(auth)/register/page.tsx        # Register page
  components/LoginForm.tsx            # Login form component
  components/RegisterForm.tsx         # Register form component
  components/AuthGuard.tsx            # Client-side auth guard
  middleware.ts                       # Next.js middleware (edge auth check)

MODIFY:
  prisma/schema.prisma                # +User model, +Todo.userId, native types
  lib/types.ts                        # +AuthUser type
  lib/prisma.ts                       # +UUIDv7 middleware
  lib/repositories/todo.repository.ts # +userId param on all queries
  lib/services/todo.service.ts        # +userId param, scoped cache key
  lib/services/audit.service.ts       # +userId on getAllTodos/getDeletedTodos
  app/api/todos/route.ts              # +session extraction, pass userId
  app/api/todos/[id]/route.ts         # +session extraction, pass userId
  app/layout.tsx                      # +Providers wrapper
  app/page.tsx                        # +AuthGuard wrapper
  package.json                        # +next-auth, bcryptjs, uuidv7
  .env.example                        # +NEXTAUTH_SECRET, NEXTAUTH_URL
```

---

### Task 1: Dependencies, Schema & Prisma Middleware

**Files:**
- Modify: `package.json`
- Modify: `prisma/schema.prisma`
- Modify: `lib/prisma.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install next-auth@5 beta bcryptjs uuidv7
npm install -D @types/bcryptjs
```

Expected: packages added to package.json and node_modules

- [ ] **Step 2: Update Prisma schema**

Replace entire `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid()) @db.Uuid
  username  String   @unique @db.VarChar(50)
  password  String   @db.VarChar(60) // bcrypt hash always 60 chars
  createdAt DateTime @default(now()) @db.Timestamptz()
  updatedAt DateTime @updatedAt @db.Timestamptz()
  todos     Todo[]
}

model Todo {
  id        String          @id @default(uuid()) @db.Uuid
  title     String          @db.VarChar(200)
  completed Boolean         @default(false)
  deletedAt DateTime?       @db.Timestamptz()
  createdAt DateTime        @default(now()) @db.Timestamptz()
  updatedAt DateTime        @updatedAt @db.Timestamptz()
  userId    String          @db.Uuid
  user      User            @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

- [ ] **Step 3: Generate Prisma client**

Run: `npx prisma generate`
Expected: Prisma client regenerated with User model

- [ ] **Step 4: Add UUIDv7 middleware to Prisma client**

Replace `lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { v7 as uuidv7 } from "uuidv7";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

prisma.$use(async (params, next) => {
  if (params.action === "create" && !params.args.data.id) {
    params.args.data.id = uuidv7();
  }
  return next(params);
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Commit**

```bash
git add package.json prisma/schema.prisma lib/prisma.ts .env.example
git commit -m "feat: add User model, UUIDv7 middleware, native DB types"
```

---

### Task 2: Shared Types & Auth Validation

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/validation/auth.validation.ts`

- [ ] **Step 1: Add auth types to lib/types.ts**

Append to existing `lib/types.ts`:

```ts
export interface AuthUser {
  id: string;
  username: string;
}

export interface RegisterInput {
  username: string;
  password: string;
}

export interface AuthResponse {
  user?: AuthUser;
  error?: string;
}
```

- [ ] **Step 2: Write auth validation tests**

Create `lib/validation/__tests__/auth.validation.test.ts`:

```ts
import { validateRegisterInput } from "../auth.validation";

describe("validateRegisterInput", () => {
  it("rejects empty username", () => {
    expect(validateRegisterInput({ username: "", password: "password123" })).toEqual({
      valid: false,
      error: "Username is required",
    });
  });

  it("rejects username under 3 chars", () => {
    expect(validateRegisterInput({ username: "ab", password: "password123" })).toEqual({
      valid: false,
      error: "Username must be between 3 and 50 characters",
    });
  });

  it("rejects username over 50 chars", () => {
    expect(validateRegisterInput({ username: "a".repeat(51), password: "password123" })).toEqual({
      valid: false,
      error: "Username must be between 3 and 50 characters",
    });
  });

  it("rejects empty password", () => {
    expect(validateRegisterInput({ username: "testuser", password: "" })).toEqual({
      valid: false,
      error: "Password is required",
    });
  });

  it("rejects password under 8 chars", () => {
    expect(validateRegisterInput({ username: "testuser", password: "short" })).toEqual({
      valid: false,
      error: "Password must be at least 8 characters",
    });
  });

  it("accepts valid input", () => {
    expect(validateRegisterInput({ username: "testuser", password: "password123" })).toEqual({
      valid: true,
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest lib/validation/__tests__/auth.validation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement auth validation**

Create `lib/validation/auth.validation.ts`:

```ts
import { RegisterInput } from "@/lib/types";

export function validateRegisterInput(input: RegisterInput): { valid: boolean; error?: string } {
  if (!input.username || input.username.trim().length === 0) {
    return { valid: false, error: "Username is required" };
  }
  if (input.username.length < 3 || input.username.length > 50) {
    return { valid: false, error: "Username must be between 3 and 50 characters" };
  }
  if (!input.password || input.password.length === 0) {
    return { valid: false, error: "Password is required" };
  }
  if (input.password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  return { valid: true };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest lib/validation/__tests__/auth.validation.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/validation/__tests__/auth.validation.test.ts lib/validation/auth.validation.ts
git commit -m "feat: add auth types and validation"
```

---

### Task 3: User Repository

**Files:**
- Create: `lib/repositories/user.repository.ts`

- [ ] **Step 1: Write user repository tests**

Create `lib/repositories/__tests__/user.repository.test.ts`:

```ts
import { userRepository } from "../user.repository";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("userRepository", () => {
  beforeEach(() => jest.clearAllMocks());

  it("finds user by username", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "1", username: "test" });
    const result = await userRepository.findByUsername("test");
    expect(result?.username).toBe("test");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: "test" },
    });
  });

  it("returns null when user not found", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await userRepository.findByUsername("nonexistent");
    expect(result).toBeNull();
  });

  it("creates a user", async () => {
    const hash = "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12345";
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: "1", username: "newuser", password: hash });
    const result = await userRepository.createUser("newuser", hash);
    expect(result.username).toBe("newuser");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { username: "newuser", password: hash },
    });
  });

  it("finds user by id", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "1", username: "test" });
    const result = await userRepository.findById("1");
    expect(result?.id).toBe("1");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/repositories/__tests__/user.repository.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement user repository**

Create `lib/repositories/user.repository.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { AuthUser } from "@/lib/types";

export const userRepository = {
  async findByUsername(username: string): Promise<{ id: string; username: string; password: string } | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  },

  async findById(id: string): Promise<AuthUser | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });
  },

  async createUser(username: string, hashedPassword: string): Promise<AuthUser> {
    return prisma.user.create({
      data: { username, password: hashedPassword },
      select: { id: true, username: true },
    });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/repositories/__tests__/user.repository.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/user.repository.ts lib/repositories/__tests__/user.repository.test.ts
git commit -m "feat: add user repository"
```

---

### Task 4: Auth Config (Auth.js)

**Files:**
- Create: `lib/auth/config.ts`

- [ ] **Step 1: Create Auth.js configuration**

Create `lib/auth/config.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { userRepository } from "@/lib/repositories/user.repository";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await userRepository.findByUsername(credentials.username as string);
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.password);
        if (!valid) return null;

        return { id: user.id, name: user.username };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.username = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.name = token.username as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/auth/config.ts
git commit -m "feat: add Auth.js config with credentials provider"
```

---

### Task 5: Auth Service

**Files:**
- Create: `lib/auth/service.ts`

- [ ] **Step 1: Write auth service tests**

Create `lib/services/__tests__/auth.service.test.ts`:

```ts
import { authService } from "@/lib/auth/service";
import { userRepository } from "@/lib/repositories/user.repository";
import bcrypt from "bcryptjs";

jest.mock("@/lib/repositories/user.repository", () => ({
  userRepository: {
    findByUsername: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe("authService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("register", () => {
    it("creates user with hashed password", async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashedpassword1234567890123456789012345678901234567890");
      (userRepository.createUser as jest.Mock).mockResolvedValue({ id: "1", username: "newuser" });

      const result = await authService.register({ username: "newuser", password: "password123" });

      expect(result.user?.username).toBe("newuser");
      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
    });

    it("rejects duplicate username", async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue({ id: "1", username: "existing" });

      const result = await authService.register({ username: "existing", password: "password123" });

      expect(result.error).toBe("Username already taken");
      expect(userRepository.createUser).not.toHaveBeenCalled();
    });

    it("rejects invalid input", async () => {
      const result = await authService.register({ username: "ab", password: "short" });

      expect(result.error).toBeDefined();
      expect(userRepository.createUser).not.toHaveBeenCalled();
    });
  });

  describe("verifyPassword", () => {
    it("returns true for correct password", async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result = await authService.verifyPassword("password123", "$2b$10$hash");
      expect(result).toBe(true);
    });

    it("returns false for wrong password", async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const result = await authService.verifyPassword("wrong", "$2b$10$hash");
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/services/__tests__/auth.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement auth service**

Create `lib/auth/service.ts`:

```ts
import bcrypt from "bcryptjs";
import { userRepository } from "@/lib/repositories/user.repository";
import { validateRegisterInput } from "@/lib/validation/auth.validation";
import { RegisterInput, AuthResponse } from "@/lib/types";

const SALT_ROUNDS = 10;

export const authService = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const validation = validateRegisterInput(input);
    if (!validation.valid) {
      return { error: validation.error };
    }

    const existing = await userRepository.findByUsername(input.username);
    if (existing) {
      return { error: "Username already taken" };
    }

    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await userRepository.createUser(input.username, hashedPassword);
    return { user };
  },

  async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/services/__tests__/auth.service.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/auth/service.ts lib/services/__tests__/auth.service.test.ts
git commit -m "feat: add auth service"
```

---

### Task 6: Auth API Routes

**Files:**
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `app/api/auth/register/route.ts`

- [ ] **Step 1: Create Auth.js catch-all route**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth/config";

export const { GET, POST } = handlers;
```

- [ ] **Step 2: Create register API route**

Create `app/api/auth/register/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/lib/auth/service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await authService.register({
      username: body.username,
      password: body.password,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/
git commit -m "feat: add auth API routes"
```

---

### Task 7: Update Todo Repository with userId

**Files:**
- Modify: `lib/repositories/todo.repository.ts`
- Modify: `lib/repositories/__tests__/todo.repository.test.ts`

- [ ] **Step 1: Update todo repository tests for userId**

Replace `lib/repositories/__tests__/todo.repository.test.ts`:

```ts
import { todoRepository } from "../todo.repository";

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

const userId = "user-1";

describe("todoRepository", () => {
  beforeEach(() => jest.clearAllMocks());

  it("finds active todos for a user", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: null, userId }]);
    const result = await todoRepository.findActiveTodos(userId);
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, userId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds all todos for a user", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: null, userId }]);
    const result = await todoRepository.findAllTodos(userId);
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds deleted todos for a user", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: new Date(), userId }]);
    const result = await todoRepository.findDeletedTodos(userId);
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null }, userId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("creates a todo for a user", async () => {
    (prisma.todo.create as jest.Mock).mockResolvedValue({ id: "1", title: "new", userId });
    const result = await todoRepository.createTodo({ title: "new" }, userId);
    expect(result.title).toBe("new");
    expect(prisma.todo.create).toHaveBeenCalledWith({
      data: { title: "new", userId },
    });
  });

  it("updates a todo", async () => {
    (prisma.todo.update as jest.Mock).mockResolvedValue({ id: "1", title: "updated", userId });
    const result = await todoRepository.updateTodo("1", { title: "updated" });
    expect(result.title).toBe("updated");
    expect(prisma.todo.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { title: "updated" },
    });
  });

  it("finds todo by id", async () => {
    (prisma.todo.findUnique as jest.Mock).mockResolvedValue({ id: "1", title: "test", userId });
    const result = await todoRepository.findTodoById("1");
    expect(result?.id).toBe("1");
    expect(prisma.todo.findUnique).toHaveBeenCalledWith({ where: { id: "1" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/repositories/__tests__/todo.repository.test.ts`
Expected: FAIL — existing tests have wrong signatures

- [ ] **Step 3: Update todo repository with userId**

Replace `lib/repositories/todo.repository.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { CreateTodoInput, UpdateTodoInput, Todo } from "@/lib/types";

export const todoRepository = {
  async findActiveTodos(userId: string): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: null, userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findAllTodos(userId: string): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findDeletedTodos(userId: string): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: { not: null }, userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findTodoById(id: string): Promise<Todo | null> {
    return prisma.todo.findUnique({
      where: { id },
    });
  },

  async createTodo(input: CreateTodoInput, userId: string): Promise<Todo> {
    return prisma.todo.create({
      data: { title: input.title, userId },
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

- [ ] **Step 5: Commit**

```bash
git add lib/repositories/todo.repository.ts lib/repositories/__tests__/todo.repository.test.ts
git commit -m "feat: scope todo repository queries by userId"
```

---

### Task 8: Update Todo Service with userId

**Files:**
- Modify: `lib/services/todo.service.ts`
- Modify: `lib/services/__tests__/todo.service.test.ts`

- [ ] **Step 1: Update todo service tests for userId**

Replace `lib/services/__tests__/todo.service.test.ts`:

```ts
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

jest.mock("@/lib/validation/todo.validation", () => ({
  validateTodoInput: jest.fn(),
  validateUpdateInput: jest.fn(),
}));

const userId = "user-1";

describe("todoService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gets todos from cache on hit", async () => {
    (cacheService.get as jest.Mock).mockReturnValue([{ id: "1" }]);
    const result = await todoService.getTodos(userId);
    expect(result).toEqual([{ id: "1" }]);
    expect(todoRepository.findActiveTodos).not.toHaveBeenCalled();
  });

  it("gets todos from DB on cache miss", async () => {
    (cacheService.get as jest.Mock).mockReturnValue(null);
    (todoRepository.findActiveTodos as jest.Mock).mockResolvedValue([{ id: "1" }]);
    const result = await todoService.getTodos(userId);
    expect(result).toEqual([{ id: "1" }]);
    expect(cacheService.set).toHaveBeenCalledWith(`todos:${userId}`, [{ id: "1" }]);
  });

  it("creates todo and invalidates cache", async () => {
    (validation.validateTodoInput as jest.Mock).mockReturnValue({ valid: true });
    (todoRepository.createTodo as jest.Mock).mockResolvedValue({ id: "1", title: "new", userId });
    const result = await todoService.createTodo({ title: "new" }, userId);
    expect(result.todo?.title).toBe("new");
    expect(cacheService.invalidate).toHaveBeenCalledWith(`todos:${userId}`);
  });

  it("rejects invalid input on create", async () => {
    (validation.validateTodoInput as jest.Mock).mockReturnValue({ valid: false, error: "Title is required" });
    const result = await todoService.createTodo({ title: "" }, userId);
    expect(result.error).toBe("Title is required");
    expect(todoRepository.createTodo).not.toHaveBeenCalled();
  });

  it("updates todo and invalidates cache", async () => {
    (validation.validateUpdateInput as jest.Mock).mockReturnValue({ valid: true });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1", userId });
    (todoRepository.updateTodo as jest.Mock).mockResolvedValue({ id: "1", title: "updated", userId });
    const result = await todoService.updateTodo("1", { title: "updated" }, userId);
    expect(result.todo?.title).toBe("updated");
    expect(cacheService.invalidate).toHaveBeenCalledWith(`todos:${userId}`);
  });

  it("returns 404 when updating non-existent todo", async () => {
    (validation.validateUpdateInput as jest.Mock).mockReturnValue({ valid: true });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue(null);
    const result = await todoService.updateTodo("999", { title: "updated" }, userId);
    expect(result.error).toBe("Todo not found");
  });

  it("returns 404 when updating another user's todo", async () => {
    (validation.validateUpdateInput as jest.Mock).mockReturnValue({ valid: true });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1", userId: "other-user" });
    const result = await todoService.updateTodo("1", { title: "hacked" }, userId);
    expect(result.error).toBe("Todo not found");
  });

  it("deletes todo via audit service and invalidates cache", async () => {
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1", userId });
    (auditService.softDelete as jest.Mock).mockResolvedValue({ id: "1", deletedAt: new Date(), userId });
    const result = await todoService.deleteTodo("1", userId);
    expect(result.todo?.deletedAt).toBeDefined();
    expect(cacheService.invalidate).toHaveBeenCalledWith(`todos:${userId}`);
  });

  it("returns 404 when deleting non-existent todo", async () => {
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue(null);
    const result = await todoService.deleteTodo("999", userId);
    expect(result.error).toBe("Todo not found");
  });

  it("returns 404 when deleting another user's todo", async () => {
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1", userId: "other-user" });
    const result = await todoService.deleteTodo("1", userId);
    expect(result.error).toBe("Todo not found");
    expect(auditService.softDelete).not.toHaveBeenCalled();
  });

  it("rejects update with empty title", async () => {
    (validation.validateUpdateInput as jest.Mock).mockReturnValue({ valid: false, error: "Title cannot be empty" });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1", userId });
    const result = await todoService.updateTodo("1", { title: "" }, userId);
    expect(result.error).toBe("Title cannot be empty");
    expect(todoRepository.updateTodo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/services/__tests__/todo.service.test.ts`
Expected: FAIL — methods have wrong signatures

- [ ] **Step 3: Update todo service with userId**

Replace `lib/services/todo.service.ts`:

```ts
import { todoRepository } from "@/lib/repositories/todo.repository";
import { cacheService } from "./cache.service";
import { auditService } from "./audit.service";
import { validateTodoInput, validateUpdateInput } from "@/lib/validation/todo.validation";
import { CreateTodoInput, UpdateTodoInput, ApiResponse, Todo } from "@/lib/types";

export const todoService = {
  async getTodos(userId: string): Promise<Todo[]> {
    const cacheKey = `todos:${userId}`;
    const cached = cacheService.get<Todo[]>(cacheKey);
    if (cached) return cached;

    const todos = await todoRepository.findActiveTodos(userId);
    cacheService.set(cacheKey, todos);
    return todos;
  },

  async getTodoById(id: string): Promise<Todo | null> {
    return todoRepository.findTodoById(id);
  },

  async createTodo(input: CreateTodoInput, userId: string): Promise<ApiResponse<Todo>> {
    const validation = validateTodoInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const todo = await todoRepository.createTodo(input, userId);
    cacheService.invalidate(`todos:${userId}`);
    return { todo };
  },

  async updateTodo(id: string, input: UpdateTodoInput, userId: string): Promise<ApiResponse<Todo>> {
    const validation = validateUpdateInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const existing = await todoRepository.findTodoById(id);
    if (!existing || existing.userId !== userId) {
      return { error: "Todo not found" };
    }

    const todo = await todoRepository.updateTodo(id, input);
    cacheService.invalidate(`todos:${userId}`);
    return { todo };
  },

  async deleteTodo(id: string, userId: string): Promise<ApiResponse<Todo>> {
    const existing = await todoRepository.findTodoById(id);
    if (!existing || existing.userId !== userId) {
      return { error: "Todo not found" };
    }

    const todo = await auditService.softDelete(id);
    cacheService.invalidate(`todos:${userId}`);
    return { todo };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/services/__tests__/todo.service.test.ts`
Expected: PASS (all 11 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/services/todo.service.ts lib/services/__tests__/todo.service.test.ts
git commit -m "feat: scope todo service by userId"
```

---

### Task 9: Update Audit Service with userId

**Files:**
- Modify: `lib/services/audit.service.ts`
- Modify: `lib/services/__tests__/audit.service.test.ts`

- [ ] **Step 1: Update audit service tests for userId**

Replace `lib/services/__tests__/audit.service.test.ts`:

```ts
import { auditService } from "../audit.service";
import { todoRepository } from "@/lib/repositories/todo.repository";
import { UpdateTodoInput } from "@/lib/types";

jest.mock("@/lib/repositories/todo.repository", () => ({
  todoRepository: {
    findDeletedTodos: jest.fn(),
    findAllTodos: jest.fn(),
    updateTodo: jest.fn(),
  },
}));

const userId = "user-1";

describe("auditService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gets deleted todos for a user", async () => {
    (todoRepository.findDeletedTodos as jest.Mock).mockResolvedValue([
      { id: "1", deletedAt: new Date(), userId },
    ]);
    const result = await auditService.getDeletedTodos(userId);
    expect(result).toHaveLength(1);
    expect(todoRepository.findDeletedTodos).toHaveBeenCalledWith(userId);
  });

  it("gets all todos for a user", async () => {
    (todoRepository.findAllTodos as jest.Mock).mockResolvedValue([{ id: "1", userId }, { id: "2", userId }]);
    const result = await auditService.getAllTodos(userId);
    expect(result).toHaveLength(2);
    expect(todoRepository.findAllTodos).toHaveBeenCalledWith(userId);
  });

  it("soft deletes a todo", async () => {
    (todoRepository.updateTodo as jest.Mock).mockImplementation(
      async (_id: string, data: UpdateTodoInput) => ({
        id: "1",
        ...data,
        userId,
      })
    );
    const result = await auditService.softDelete("1");
    expect(todoRepository.updateTodo).toHaveBeenCalledWith("1", {
      deletedAt: expect.any(Date),
    });
    expect(result.deletedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/services/__tests__/audit.service.test.ts`
Expected: FAIL — methods have wrong signatures

- [ ] **Step 3: Update audit service with userId**

Replace `lib/services/audit.service.ts`:

```ts
import { todoRepository } from "@/lib/repositories/todo.repository";
import { Todo } from "@/lib/types";

export const auditService = {
  async getDeletedTodos(userId: string): Promise<Todo[]> {
    return todoRepository.findDeletedTodos(userId);
  },

  async getAllTodos(userId: string): Promise<Todo[]> {
    return todoRepository.findAllTodos(userId);
  },

  async softDelete(id: string): Promise<Todo> {
    return todoRepository.updateTodo(id, { deletedAt: new Date() });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/services/__tests__/audit.service.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/services/audit.service.ts lib/services/__tests__/audit.service.test.ts
git commit -m "feat: scope audit service by userId"
```

---

### Task 10: Update Todo API Routes with Auth

**Files:**
- Modify: `app/api/todos/route.ts`
- Modify: `app/api/todos/[id]/route.ts`
- Modify: `app/api/todos/__tests__/route.test.ts`
- Modify: `app/api/todos/__tests__/e2e-todo-flow.test.ts`

- [ ] **Step 1: Update GET/POST /api/todos route**

Replace `app/api/todos/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { todoService } from "@/lib/services/todo.service";
import { auditService } from "@/lib/services/audit.service";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true";

  try {
    const todos = includeDeleted
      ? await auditService.getAllTodos(session.user.id)
      : await todoService.getTodos(session.user.id);

    return NextResponse.json({ todos });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title } = await request.json();
    const result = await todoService.createTodo({ title }, session.user.id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ todo: result.todo }, { status: 201 });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update GET/PUT/DELETE /api/todos/[id] route**

Replace `app/api/todos/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { todoService } from "@/lib/services/todo.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const todo = await todoService.getTodoById(params.id);

    if (!todo || todo.userId !== session.user.id) {
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await todoService.updateTodo(params.id, body, session.user.id);

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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await todoService.deleteTodo(params.id, session.user.id);

    if (result.error === "Todo not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ todo: result.todo });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Update route.test.ts with auth mock**

Replace `app/api/todos/__tests__/route.test.ts`:

```ts
import { POST } from "../route";

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "test-user" } }),
}));

describe("POST /api/todos", () => {
  it("returns 400 for malformed JSON", async () => {
    const request = {
      json: async () => { throw new SyntaxError("Unexpected end of JSON input"); },
    };
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });
});
```

- [ ] **Step 4: Update e2e test for userId**

Replace `app/api/todos/__tests__/e2e-todo-flow.test.ts`:

```ts
import { GET, POST } from "../route";
import { GET as GET_BY_ID, PUT, DELETE } from "../[id]/route";

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

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

import { prisma } from "@/lib/prisma";
import { cacheService } from "@/lib/services/cache.service";
import { auth } from "@/lib/auth/config";

const userId = "test-user-id";

const mockJson = (data: unknown) => {
  let consumed = false;
  return jest.fn().mockImplementation(async () => {
    if (consumed) throw new Error("Body already consumed");
    consumed = true;
    return data;
  });
};

const mockNextRequest = (body?: unknown) => {
  const jsonFn = body !== undefined ? mockJson(body) : jest.fn();
  return { json: jsonFn, url: "http://localhost:3000/api/todos" } as any;
};

const mockNextRequestWithParams = (_url: string, body?: unknown) => {
  const jsonFn = body !== undefined ? mockJson(body) : jest.fn();
  return { json: jsonFn } as any;
};

const mockTodo = (overrides = {}) => ({
  id: "clx123",
  title: "Buy groceries",
  completed: false,
  deletedAt: null,
  createdAt: new Date("2026-05-21T10:00:00Z"),
  updatedAt: new Date("2026-05-21T10:00:00Z"),
  userId,
  ...overrides,
});

describe("E2E: Save and Load Todo Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.clear();
    (auth as jest.Mock).mockResolvedValue({ user: { id: userId } });
  });

  describe("Save: POST /api/todos", () => {
    it("creates a todo and returns it with 201", async () => {
      const created = mockTodo({ id: "clx001", title: "Write tests" });
      (prisma.todo.create as jest.Mock).mockResolvedValue(created);

      const req = mockNextRequest({ title: "Write tests" });
      const response = await POST(req);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.todo.title).toBe("Write tests");
      expect(body.todo.id).toBe("clx001");
    });

    it("rejects empty title with 400 validation error", async () => {
      const req = mockNextRequest({ title: "" });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Title is required");
      expect(prisma.todo.create).not.toHaveBeenCalled();
    });

    it("rejects title over 200 chars", async () => {
      const req = mockNextRequest({ title: "a".repeat(201) });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Title must be 200 characters or less");
      expect(prisma.todo.create).not.toHaveBeenCalled();
    });
  });

  describe("Load: GET /api/todos", () => {
    it("returns active todos", async () => {
      const todos = [
        mockTodo({ id: "clx001", title: "First" }),
        mockTodo({ id: "clx002", title: "Second" }),
      ];
      (prisma.todo.findMany as jest.Mock).mockResolvedValue(todos);

      const req = mockNextRequest();
      const response = await GET(req);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todos).toHaveLength(2);
      expect(body.todos[0].title).toBe("First");
    });

    it("returns only active todos by default", async () => {
      (prisma.todo.findMany as jest.Mock).mockResolvedValue([mockTodo({ id: "clx001" })]);

      const req = mockNextRequest();
      await GET(req);

      expect(prisma.todo.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, userId },
        orderBy: { createdAt: "desc" },
      });
    });

    it("returns empty array when no todos exist", async () => {
      (prisma.todo.findMany as jest.Mock).mockResolvedValue([]);
      const req = mockNextRequest();
      const response = await GET(req);
      const body = await response.json();
      expect(body.todos).toEqual([]);
    });
  });

  describe("Full lifecycle: create => load => toggle => load => delete => load", () => {
    it("creates, reads, updates, and soft-deletes a todo", async () => {
      (prisma.todo.create as jest.Mock).mockResolvedValue(mockTodo({ id: "clx001", title: "Learn testing", completed: false }));
      const createReq = mockNextRequest({ title: "Learn testing" });
      const createRes = await POST(createReq);
      expect(createRes.status).toBe(201);

      (prisma.todo.findMany as jest.Mock).mockResolvedValue([mockTodo({ id: "clx001", title: "Learn testing" })]);
      const loadReq = mockNextRequest();
      const loadRes = await GET(loadReq);
      const loadBody = await loadRes.json();
      expect(loadBody.todos).toHaveLength(1);
      expect(loadBody.todos[0].title).toBe("Learn testing");

      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(mockTodo({ id: "clx001", title: "Learn testing" }));
      (prisma.todo.update as jest.Mock).mockResolvedValue(mockTodo({ id: "clx001", title: "Learn testing", completed: true }));
      const toggleReq = mockNextRequestWithParams("", { completed: true });
      const toggleRes = await PUT(toggleReq, { params: { id: "clx001" } });
      const toggleBody = await toggleRes.json();
      expect(toggleBody.todo.completed).toBe(true);

      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(mockTodo({ id: "clx001", title: "Learn testing", completed: true }));
      (prisma.todo.update as jest.Mock).mockResolvedValue(mockTodo({ id: "clx001", title: "Learn testing", completed: true, deletedAt: new Date() }));
      const deleteReq = mockNextRequestWithParams("");
      const deleteRes = await DELETE(deleteReq, { params: { id: "clx001" } });
      const deleteBody = await deleteRes.json();
      expect(deleteBody.todo.deletedAt).not.toBeNull();

      (prisma.todo.findMany as jest.Mock).mockResolvedValue([]);
      const finalLoadReq = mockNextRequest();
      const finalLoadRes = await GET(finalLoadReq);
      const finalBody = await finalLoadRes.json();
      expect(finalBody.todos).toHaveLength(0);
    });
  });

  describe("GET /api/todos/:id", () => {
    it("returns a single todo by id", async () => {
      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(mockTodo({ id: "clx001" }));
      const req = mockNextRequestWithParams("");
      const response = await GET_BY_ID(req, { params: { id: "clx001" } });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todo.id).toBe("clx001");
    });

    it("returns 404 for non-existent todo", async () => {
      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockNextRequestWithParams("");
      const response = await GET_BY_ID(req, { params: { id: "nonexistent" } });
      expect(response.status).toBe(404);
    });

    it("returns 404 for another user's todo", async () => {
      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(mockTodo({ userId: "other-user" }));
      const req = mockNextRequestWithParams("");
      const response = await GET_BY_ID(req, { params: { id: "clx001" } });
      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/todos/:id", () => {
    it("updates todo title", async () => {
      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(mockTodo());
      (prisma.todo.update as jest.Mock).mockResolvedValue(mockTodo({ title: "Updated title" }));
      const req = mockNextRequestWithParams("", { title: "Updated title" });
      const response = await PUT(req, { params: { id: "clx123" } });
      const body = await response.json();
      expect(body.todo.title).toBe("Updated title");
    });

    it("returns 404 when updating non-existent todo", async () => {
      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockNextRequestWithParams("", { title: "Nope" });
      const response = await PUT(req, { params: { id: "missing" } });
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/todos/:id", () => {
    it("soft-deletes a todo", async () => {
      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(mockTodo());
      (prisma.todo.update as jest.Mock).mockResolvedValue(mockTodo({ deletedAt: new Date() }));
      const req = mockNextRequestWithParams("");
      const response = await DELETE(req, { params: { id: "clx123" } });
      const body = await response.json();
      expect(body.todo.deletedAt).not.toBeNull();
    });

    it("returns 404 when deleting non-existent todo", async () => {
      (prisma.todo.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockNextRequestWithParams("");
      const response = await DELETE(req, { params: { id: "missing" } });
      expect(response.status).toBe(404);
    });
  });

  describe("Unauthenticated requests", () => {
    it("returns 401 when no session", async () => {
      (auth as jest.Mock).mockResolvedValue(null);
      const req = mockNextRequest();
      const response = await GET(req);
      expect(response.status).toBe(401);
    });
  });
});
```

- [ ] **Step 5: Run all todo tests**

Run: `npx jest`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/todos/
git commit -m "feat: add auth to todo API routes and tests"
```

---

### Task 11: Middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create Next.js middleware**

Create `middleware.ts` at project root:

```ts
export { auth as middleware } from "@/lib/auth/config";

export const config = {
  matcher: ["/api/todos/:path*", "/"],
};
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add auth middleware to protect todo routes"
```

---

### Task 12: Frontend Auth (Providers, AuthGuard, Login/Register)

**Files:**
- Create: `app/providers.tsx`
- Create: `components/AuthGuard.tsx`
- Create: `components/LoginForm.tsx`
- Create: `components/RegisterForm.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create SessionProvider wrapper**

Create `app/providers.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 2: Create AuthGuard component**

Create `components/AuthGuard.tsx`:

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Create login form**

Create `components/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid username or password");
    } else {
      router.push("/");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}
      <div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          maxLength={50}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Sign In
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Create register form**

Create `components/RegisterForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Registration failed");
      return;
    }

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.ok) {
      router.push("/");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}
      <div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          maxLength={50}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 chars)"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Create Account
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Create login page**

Create `app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoginForm } from "@/components/LoginForm";
import Link from "next/link";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") return null;

  return (
    <main className="max-w-sm mx-auto py-16 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Sign In</h1>
      <LoginForm />
      <p className="text-center text-sm text-gray-500 mt-4">
        Don't have an account?{" "}
        <Link href="/register" className="text-blue-500 hover:underline">
          Register
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Create register page**

Create `app/(auth)/register/page.tsx`:

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RegisterForm } from "@/components/RegisterForm";
import Link from "next/link";

export default function RegisterPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") return null;

  return (
    <main className="max-w-sm mx-auto py-16 px-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Create Account</h1>
      <RegisterForm />
      <p className="text-center text-sm text-gray-500 mt-4">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-500 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Update layout with SessionProvider**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
      <body className="min-h-screen bg-gray-50">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Update main page with AuthGuard and logout**

Replace `app/page.tsx`:

```tsx
"use client";

import useSWR from "swr";
import { useSession, signOut } from "next-auth/react";
import { Todo } from "@/lib/types";
import { TodoForm } from "@/components/TodoForm";
import { TodoList } from "@/components/TodoList";
import { AuthGuard } from "@/components/AuthGuard";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function HomeContent() {
  const { data: session } = useSession();
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
      <TodoForm onSubmit={handleCreate} />
      <TodoList todos={data.todos} onToggle={handleToggle} onDelete={handleDelete} />
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

- [ ] **Step 9: Update .env.example**

Replace `.env.example`:

```env
DATABASE_URL="postgresql://user:password@host:5432/todo_db"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 10: Run the full test suite**

Run: `npx jest`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add app/ components/ middleware.ts .env.example
git commit -m "feat: add frontend auth with login/register pages"
```

---

## Self-Review

| Spec Requirement | Task |
|-----------------|------|
| User model with username/password | Task 1 |
| Native type annotations everywhere | Task 1 |
| UUIDv7 for IDs | Task 1 (Prisma middleware) |
| Auth.js v5 with Credentials provider | Task 4 |
| authService wrapper | Task 5 |
| user repository | Task 3 |
| Register endpoint | Task 6 |
| Login/logout via Auth.js | Task 6, Task 12 |
| todo repository scoped by userId | Task 7 |
| todo service scoped by userId | Task 8 |
| Todo API routes with auth | Task 10 |
| Middleware protecting routes | Task 11 |
| Login/register pages | Task 12 |
| AuthGuard on main page | Task 12 |
| SessionProvider in layout | Task 12 |

**Placeholder scan:** No TBDs, TODOs, vague instructions, or incomplete code blocks.

**Type consistency:** `userId: string` used consistently from API routes → service → repository across all tasks. Cache key pattern `todos:${userId}` matches across todo service and tests. Auth service returns `AuthResponse` matching `lib/types.ts`.
