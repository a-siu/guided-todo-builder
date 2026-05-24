# TODO App — AGENTS.md

## Stack
- Next.js 14 (App Router), React 18, TypeScript strict, Tailwind CSS
- PostgreSQL 16 via Docker Compose, Prisma 5 ORM
- Vitest 3 (globals: true, `@/` alias from vitest.config.ts)
- SWR for client data fetching, in-memory cache layer
- Vercel deployment (vercel.json with prisma generate + next build)

## Dev Setup (order matters)
```bash
npm run db:setup    # docker compose up -d postgres, wait, then prisma db push
npm run dev         # next dev
```

If already running: `npm run db:up` then `npm run db:push` if schema changed.

Single commands:
- `npm test` — vitest run (all 46 tests)
- `npm run build` — prisma generate + next build
- `npm run db:generate` — prisma generate only

## Architecture
```
pages (SWR fetch) → app/api/todos/route.ts → todo.service → todo.repository → Prisma → PostgreSQL
                                              ↕ cache.service (in-memory Map)
                                              ↕ audit.service (soft-delete)
```
- API routes: `app/api/todos/route.ts` (GET/POST), `app/api/todos/[id]/route.ts` (GET/PUT/DELETE)
- Service layer: `lib/services/todo.service.ts` — business logic + cache invalidation
- Repository layer: `lib/repositories/todo.repository.ts` — raw Prisma queries
- Validation: `lib/validation/todo.validation.ts` — title required, max 200 chars
- Types: `lib/types.ts` — Todo, CreateTodoInput, UpdateTodoInput, ApiResponse\<T\>

## Key Patterns
- **Soft delete** via `deletedAt: Date?` field; active todos filtered by `deletedAt: null`
- **Cache**: `cacheService` wraps a `Map<string, unknown>`; invalidated on create/update/delete
- **SWR fetcher** throws on non-ok responses (error UI shows instead of crash)
- **Tests co-located** in `__tests__/` next to source files; all mock Prisma via `vi.mock("@/lib/prisma")`
- **TodoList** defensively checks `!todos` before `.length` to avoid render crashes

## Gotchas
- `.env` must have `DATABASE_URL` pointing to local or prod Postgres
- Vercel deployment needs `DATABASE_URL` env var set in Vercel dashboard (not in `.env`)
- `next build` requires Postgres to be running (Prisma validates connection at build time if schema is pushed)
- Vitest v3 pinned (v4 requires Node >=20.19)
