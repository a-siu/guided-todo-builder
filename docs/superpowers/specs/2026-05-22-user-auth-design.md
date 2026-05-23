# User Auth Design

**Date:** 2026-05-22
**Status:** Draft

## Overview

Add username/password authentication to the existing TODO app so each user only sees and modifies their own todos. Built with Auth.js v5 (Credentials provider) wrapped in a thin service layer. IDs use UUIDv7. All string columns have explicit `@db.VarChar` size constraints.

## Architecture

```
┌───────────────────────────────────────────────────┐
│                   Next.js App                      │
├────────────────────┬──────────────────────────────┤
│  Auth Actions       │  Middleware                  │
│  (register/login/  │  (edge-level JWT check,      │
│   logout)          │   attaches userId)            │
├────────┬───────────┴──────────────────┬───────────┤
│  Auth  │                              │  Todo     │
│  Config│          API Routes          │  API      │
│ (Auth.js)│   (gateway, passes userId) │  Routes   │
├────────┴──────────────────────────────┴───────────┤
│               Service Layer                        │
│  authService.ts   │   todoService.ts (+ userId)   │
├───────────────────┴───────────────────────────────┤
│               Repository Layer                     │
│  user.repository.ts │  todo.repository.ts         │
├───────────────────────────────────────────────────┤
│                    Prisma                          │
│  User(id, username, password) — Todo(+ userId)    │
├───────────────────────────────────────────────────┤
│                  PostgreSQL                        │
└───────────────────────────────────────────────────┘
```

### Tech Additions

| Library       | Purpose                    |
|---------------|----------------------------|
| next-auth (v5) | Auth framework, JWT, cookies |
| @auth/prisma-adapter | Persists sessions/accounts (optional) |
| bcryptjs       | Password hashing            |

## Data Model

```prisma
model User {
  id        String          @id @default(uuid()) @db.Uuid
  username  String          @unique @db.VarChar(50)
  password  String          @db.VarChar(60)  // bcrypt hash always 60 chars
  createdAt DateTime        @default(now()) @db.Timestamptz()
  updatedAt DateTime        @updatedAt @db.Timestamptz()
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

**UUIDv7**: Prisma's `@default(uuid())` generates UUIDv4. We'll use the `uuidv7` npm package via Prisma middleware to set UUIDv7 on every `create` action. Schema uses `@default(uuid()) @db.Uuid` — the middleware sets the value, Prisma stores it as UUID type. Existing cuid IDs are left as-is.

Key changes:
- `Todo.id` → UUIDv7 (was cuid)
- `Todo` gains `userId` FK to `User`
- `User` model with username (50 char limit) and bcrypt password (60 char limit)
- All existing Todo `String` fields now have explicit `@db.VarChar` limits

## File Structure

```
├── lib/
│   ├── auth/
│   │   ├── config.ts            # Auth.js config (Credentials provider, JWT)
│   │   └── service.ts           # Thin wrapper: hashPassword, registerUser, authenticate
│   ├── repositories/
│   │   └── user.repository.ts   # Prisma queries for User
│   └── types.ts                 # + User, RegisterInput types
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── [...nextauth]/
│   │       │   └── route.ts     # Auth.js handler (GET session, POST login/logout)
│   │       └── register/
│   │           └── route.ts     # POST /api/auth/register (custom, Auth.js has no register)
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx         # Login page
│   │   └── register/
│   │       └── page.tsx         # Register page
│   ├── providers.tsx           # AuthProvider (SessionProvider wrapper)
│   └── middleware.ts            # Edge: protect /api/todos/* and /
├── components/
│   └── AuthGuard.tsx            # Client wrapper: redirects to /login if unauthenticated
├── middleware.ts                # Next.js middleware: JWT cookie check on /api/todos/*
└── .env                         # + NEXTAUTH_SECRET, NEXTAUTH_URL
```

## Auth Flow

### Registration
1. User fills username (≤50) + password on `/register`
2. `POST /api/auth/register` → authService validates (username unique, password ≥8 chars)
3. Server hashes password with bcrypt (salt rounds 10), creates `User` record
4. Client calls `signIn("credentials", { username, password, redirect: true })` to auto-login
5. Auth.js sets JWT httpOnly cookie, redirect to `/`

### Login
1. User fills username + password on `/login`
2. Client calls `signIn("credentials", { username, password, redirect: false })`
3. Auth.js `authorize` callback validates credentials against bcrypt hash in DB
4. On success: JWT set in httpOnly cookie by Auth.js, redirect to `/`
5. On failure: error returned, displayed on login page

### Session
- JWT contains `{ sub: userId, username }`
- Token expires: 7 days
- `jwt` callback adds `username` to the token
- `session` callback exposes `user.id` and `user.username` to the client via `useSession()`

### Logout
1. Client calls `signOut({ callbackUrl: "/login" })`
2. Auth.js clears JWT cookie, redirects to `/login`

## Middleware (Edge-Level Protection)

`middleware.ts` config with explicit matcher:

```ts
export const config = {
  matcher: ["/api/todos/:path*", "/"],
};
```

- If no valid JWT cookie on protected routes: redirect to `/login`
- If valid: forward request, `userId` available via `getServerSession` in API routes
- Public routes: `/api/auth/*`, `/login`, `/register` — no auth check (excluded by matcher)

## Todo Authorization

All todo queries now filter by `userId`:

- **Repository layer**: `findActiveTodos(userId)`, `createTodo(input, userId)` — every query takes `userId`
- **Service layer**: passes `userId` through from API route context
- **API routes**: read `userId` from session (`getServerSession(authConfig)`)
- **Enforcement**: A user literally cannot query or modify another user's todos — the `userId` filter is baked into the Prisma query

## API Specification

### Auth Endpoints

| Method | Path                           | Description          |
|--------|--------------------------------|----------------------|
| POST   | `/api/auth/register`           | Create account (custom) |
| GET    | `/api/auth/[...nextauth]`     | Get session (Auth.js) |
| POST   | `/api/auth/[...nextauth]`     | Sign in / Sign out (Auth.js) |

Registration is custom; login/logout/session are handled by Auth.js `[...nextauth]` catch-all route.

#### POST /api/auth/register

**Request body:**
```json
{ "username": "string (3-50, alphanumeric)", "password": "string (8-100)" }
```

**Response 201:**
```json
{ "user": { "id": "uuid", "username": "string" } }
```

**Error 400:** Username taken, validation failed
**Error 500:** Server error

#### POST /api/auth/login

**Request body:**
```json
{ "username": "string", "password": "string" }
```

**Response 200:** Sets httpOnly cookie, returns user object
**Error 401:** Invalid credentials

### Updated Todo Endpoints

All existing todo endpoints now require auth (401 if no session). All todos scoped to `userId` from session — no `userId` in request body.

| Method | Path             | Auth | Description                     |
|--------|------------------|------|---------------------------------|
| GET    | `/api/todos`     | Yes  | List user's active todos        |
| POST   | `/api/todos`     | Yes  | Create todo for current user    |
| PUT    | `/api/todos/:id` | Yes  | Update own todo (404 if not own)|
| DELETE | `/api/todos/:id` | Yes  | Soft-delete own todo            |

## Frontend Auth

### Auth Context
- `AuthProvider` React context wraps the app layout
- Provides: `session`, `status` (loading/authenticated/unauthenticated), `login()`, `register()`, `logout()`
- Uses Auth.js React hooks: `useSession()`, `signIn()`, `signOut()`

### Page Protection
- `/` — wrapped in `<AuthGuard>` which redirects to `/login` if unauthenticated
- `/login` — redirects to `/` if already authenticated
- `/register` — redirects to `/` if already authenticated

### SWR Update
- Fetcher updated to include `credentials: "include"` (though httpOnly cookies are sent automatically with same-origin requests)

## Error Handling

| Scenario                     | HTTP Status | Behavior                        |
|------------------------------|-------------|---------------------------------|
| No session, protected route | 401         | Redirect to /login              |
| Wrong password               | 401         | Return error, stay on /login    |
| Username taken               | 400         | Return error, stay on /register |
| Invalid input                | 400         | Show validation message         |
| Expired token                | 401         | Clear cookie, redirect /login   |
| Access other user's todo     | 404         | Same as "not found" (not 403)   |
