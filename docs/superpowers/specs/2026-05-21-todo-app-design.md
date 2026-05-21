# TODO App Design

**Date:** 2026-05-21
**Status:** Draft

## Overview

A minimal TODO application deployed to Vercel, built with Next.js App Router, PostgreSQL (Neon), and Prisma ORM. Designed with a REST API layer to support future extensibility (mobile apps, public API, additional services).

## Architecture

```
┌─────────────────────────────────────────┐
│              Vercel Platform            │
│                                         │
│  ┌───────────────────┐                  │
│  │   Next.js App     │                  │
│  │   (Client Comps)  │ ◄─── React SPA   │
│  │   + API Routes    │                  │
│  └────────┬──────────┘                  │
│           │ REST API                    │
│           ▼                             │
│  ┌───────────────────┐                  │
│  │   Prisma ORM      │                  │
│  └────────┬──────────┘                  │
│           │                             │
│           ▼                             │
│  ┌───────────────────┐                  │
│  │  Neon PostgreSQL  │                  │
│  │  (Serverless DB)  │                  │
│  └───────────────────┘                  │
└─────────────────────────────────────────┘
```

### Tech Stack

| Layer       | Technology                |
|-------------|---------------------------|
| Frontend    | Next.js 14+ App Router    |
| Styling     | Tailwind CSS              |
| API         | Next.js API Routes        |
| ORM         | Prisma                    |
| Database    | PostgreSQL (Neon)         |
| Data Fetch  | SWR                       |
| Deployment  | Vercel                    |

## Project Structure

```
todo-app/
├── app/
│   ├── page.tsx              # Main TODO page (client component)
│   ├── layout.tsx            # Root layout
│   └── api/
│       └── todos/
│           ├── route.ts              # GET /api/todos, POST /api/todos
│           └── [id]/
│               └── route.ts          # GET/PUT/DELETE /api/todos/:id
├── lib/
│   ├── prisma.ts             # Prisma client singleton
│   └── types.ts              # Shared types
├── prisma/
│   └── schema.prisma         # DB schema
├── components/
│   ├── TodoList.tsx          # List display
│   ├── TodoItem.tsx          # Single todo with toggle/delete
│   └── TodoForm.tsx          # Create/edit form
├── styles/
│   └── globals.css           # Tailwind + custom styles
└── package.json
```

## Data Model

```prisma
model Todo {
  id        String   @id @default(cuid())
  title     String
  completed Boolean  @default(false)
  deletedAt DateTime?  # null = active, set = soft-deleted
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Soft Delete Policy

All records are soft-deleted for audit purposes. No data is ever permanently removed.

- `deletedAt IS NULL` → active record
- `deletedAt IS NOT NULL` → deleted record (hidden from default queries)
- DELETE operations set `deletedAt = now()` instead of removing the row

## API Specification

### Endpoints

| Method   | Path               | Description                    |
|----------|--------------------|--------------------------------|
| GET      | `/api/todos`       | List all active todos          |
| POST     | `/api/todos`       | Create a new todo              |
| PUT      | `/api/todos/:id`   | Update a todo                  |
| DELETE   | `/api/todos/:id`   | Soft-delete a todo             |

### Request/Response Schemas

#### GET /api/todos

**Query params:**
- `includeDeleted` (optional, boolean) — if `true`, returns all records including soft-deleted

**Response 200:**
```json
{
  "todos": [
    {
      "id": "clxxx123",
      "title": "Buy groceries",
      "completed": false,
      "deletedAt": null,
      "createdAt": "2026-05-21T10:00:00Z",
      "updatedAt": "2026-05-21T10:00:00Z"
    }
  ]
}
```

#### POST /api/todos

**Request body:**
```json
{ "title": "string (required, 1-200 chars)" }
```

**Response 201:**
```json
{
  "todo": {
    "id": "clxxx123",
    "title": "Buy groceries",
    "completed": false,
    "deletedAt": null,
    "createdAt": "2026-05-21T10:00:00Z",
    "updatedAt": "2026-05-21T10:00:00Z"
  }
}
```

#### PUT /api/todos/:id

**Request body (partial):**
```json
{ "title": "string?", "completed": "boolean?" }
```

**Response 200:** Updated todo object

#### DELETE /api/todos/:id

**Response 200:** Soft-deleted todo object with `deletedAt` set

### Error Responses

| Status | Meaning                          |
|--------|----------------------------------|
| 400    | Validation error (empty title, title > 200 chars, invalid ID) |
| 404    | Todo not found                   |
| 500    | Database or internal error       |

All errors return:
```json
{ "error": "Human-readable message" }
```

## Data Flow

1. **Initial load:** Page mounts → `useSWR` fetches `GET /api/todos` → renders list
2. **Create todo:** User submits form → `POST /api/todos` → SWR revalidates → list updates
3. **Toggle complete:** User clicks checkbox → `PUT /api/todos/:id` → optimistic update → revalidate
4. **Delete todo:** User clicks delete → `DELETE /api/todos/:id` → optimistic remove → revalidate

## Client-Side Behavior

- **SWR** for caching, auto-revalidation, and optimistic updates
- Loading skeletons on initial fetch
- Inline toggle and delete with immediate visual feedback
- Form validation: title must be 1-200 characters

## Deployment

### Vercel Configuration

- **Environment variables:**
  - `DATABASE_URL` — Neon PostgreSQL connection string
- **Build steps:**
  - `prisma generate` — generate Prisma client
  - `prisma db push` — sync schema to database
- **Serverless functions:** API routes deploy as Vercel serverless functions automatically

### Future Audit Access

- `GET /api/todos?includeDeleted=true` returns all records for audit purposes
- Can be extended with admin-only access control when auth is added

## Future Extensibility

The REST API layer enables:
- Mobile app integration (same API endpoints)
- Public API exposure
- Authentication (NextAuth/Clerk) via middleware protecting API routes
- Additional features (categories, due dates, multiple lists) by extending the Prisma schema and adding new endpoints
