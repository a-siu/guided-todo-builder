import { GET, POST } from "../route";
import { GET as GET_BY_ID, PUT, DELETE } from "../[id]/route";

import { Mock, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { cacheService } from "@/lib/services/cache.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    todo: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/services/pattern.service", () => ({
  patternService: {
    upsertPattern: vi.fn(),
    normalizeTitle: vi.fn(),
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

import { patternService } from "@/lib/services/pattern.service";
import { temporalService } from "@/lib/services/temporal.service";
import { tfidfService } from "@/lib/services/tfidf.service";
import { transitionService } from "@/lib/services/transition.service";
import { auth } from "@/lib/auth/config";

const userId = "test-user-id";

const mockJson = (data: unknown) => {
  let consumed = false;
  return vi.fn().mockImplementation(async () => {
    if (consumed) {
      throw new Error("Body already consumed");
    }
    consumed = true;
    return data;
  });
};

const mockNextRequest = (body?: unknown) => {
  const jsonFn = body !== undefined ? mockJson(body) : vi.fn();
  return {
    json: jsonFn,
    url: "http://localhost:3000/api/todos",
  } as any;
};

const mockNextRequestWithParams = (_url: string, body?: unknown) => {
  const jsonFn = body !== undefined ? mockJson(body) : vi.fn();
  return {
    json: jsonFn,
  } as any;
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
    vi.clearAllMocks();
    cacheService.clear();
    (auth as Mock).mockResolvedValue({ user: { id: userId } });
    (patternService.upsertPattern as Mock).mockResolvedValue({ id: "pat-1" });
    (patternService.normalizeTitle as Mock).mockReturnValue({ hash: "abc", terms: [], stemmedTerms: [] });
  });

  describe("Save: POST /api/todos", () => {
    it("creates a todo and returns it with 201", async () => {
      const created = mockTodo({ id: "clx001", title: "Write tests" });
      (prisma.todo.create as Mock).mockResolvedValue(created);

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
      (prisma.todo.findMany as Mock).mockResolvedValue(todos);

      const req = mockNextRequest();
      const response = await GET(req);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todos).toHaveLength(2);
      expect(body.todos[0].title).toBe("First");
    });

    it("returns only active todos by default", async () => {
      (prisma.todo.findMany as Mock).mockResolvedValue([
        mockTodo({ id: "clx001" }),
      ]);

      const req = mockNextRequest();
      await GET(req);

      expect(prisma.todo.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, userId },
        orderBy: { createdAt: "desc" },
      });
    });

    it("returns empty array when no todos exist", async () => {
      (prisma.todo.findMany as Mock).mockResolvedValue([]);

      const req = mockNextRequest();
      const response = await GET(req);

      const body = await response.json();
      expect(body.todos).toEqual([]);
    });
  });

  describe("Full lifecycle: create → load → toggle → load → delete → load", () => {
    it("creates, reads, updates, and soft-deletes a todo", async () => {
      (prisma.todo.create as Mock).mockResolvedValue(
        mockTodo({ id: "clx001", title: "Learn testing", completed: false })
      );

      const createReq = mockNextRequest({ title: "Learn testing" });
      const createRes = await POST(createReq);
      expect(createRes.status).toBe(201);

      (prisma.todo.findMany as Mock).mockResolvedValue([
        mockTodo({ id: "clx001", title: "Learn testing" }),
      ]);

      const loadReq = mockNextRequest();
      const loadRes = await GET(loadReq);
      const loadBody = await loadRes.json();
      expect(loadBody.todos).toHaveLength(1);
      expect(loadBody.todos[0].title).toBe("Learn testing");

      (prisma.todo.findUnique as Mock).mockResolvedValue(
        mockTodo({ id: "clx001", title: "Learn testing" })
      );
      (prisma.todo.update as Mock).mockResolvedValue(
        mockTodo({ id: "clx001", title: "Learn testing", completed: true })
      );

      const toggleReq = mockNextRequestWithParams("", { completed: true });
      const toggleRes = await PUT(toggleReq, { params: { id: "clx001" } });
      const toggleBody = await toggleRes.json();
      expect(toggleBody.todo.completed).toBe(true);

      (prisma.todo.findUnique as Mock).mockResolvedValue(
        mockTodo({ id: "clx001", title: "Learn testing", completed: true })
      );
      (prisma.todo.update as Mock).mockResolvedValue(
        mockTodo({ id: "clx001", title: "Learn testing", completed: true, deletedAt: new Date() })
      );

      const deleteReq = mockNextRequestWithParams("");
      const deleteRes = await DELETE(deleteReq, { params: { id: "clx001" } });
      const deleteBody = await deleteRes.json();
      expect(deleteBody.todo.deletedAt).not.toBeNull();

      (prisma.todo.findMany as Mock).mockResolvedValue([]);

      const finalLoadReq = mockNextRequest();
      const finalLoadRes = await GET(finalLoadReq);
      const finalBody = await finalLoadRes.json();
      expect(finalBody.todos).toHaveLength(0);
    });
  });

  describe("GET /api/todos/:id", () => {
    it("returns a single todo by id", async () => {
      (prisma.todo.findUnique as Mock).mockResolvedValue(
        mockTodo({ id: "clx001" })
      );

      const req = mockNextRequestWithParams("");
      const response = await GET_BY_ID(req, { params: { id: "clx001" } });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.todo.id).toBe("clx001");
    });

    it("returns 404 for non-existent todo", async () => {
      (prisma.todo.findUnique as Mock).mockResolvedValue(null);

      const req = mockNextRequestWithParams("");
      const response = await GET_BY_ID(req, { params: { id: "nonexistent" } });

      expect(response.status).toBe(404);
    });

    it("returns 404 for another user's todo", async () => {
      (prisma.todo.findUnique as Mock).mockResolvedValue(mockTodo({ userId: "other-user" }));
      const req = mockNextRequestWithParams("");
      const response = await GET_BY_ID(req, { params: { id: "clx001" } });
      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/todos/:id", () => {
    it("updates todo title", async () => {
      (prisma.todo.findUnique as Mock).mockResolvedValue(mockTodo());
      (prisma.todo.update as Mock).mockResolvedValue(
        mockTodo({ title: "Updated title" })
      );

      const req = mockNextRequestWithParams("", { title: "Updated title" });
      const response = await PUT(req, { params: { id: "clx123" } });

      const body = await response.json();
      expect(body.todo.title).toBe("Updated title");
    });

    it("returns 404 when updating non-existent todo", async () => {
      (prisma.todo.findUnique as Mock).mockResolvedValue(null);

      const req = mockNextRequestWithParams("", { title: "Nope" });
      const response = await PUT(req, { params: { id: "missing" } });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/todos/:id", () => {
    it("soft-deletes a todo", async () => {
      (prisma.todo.findUnique as Mock).mockResolvedValue(mockTodo());
      (prisma.todo.update as Mock).mockResolvedValue(
        mockTodo({ deletedAt: new Date() })
      );

      const req = mockNextRequestWithParams("");
      const response = await DELETE(req, { params: { id: "clx123" } });

      const body = await response.json();
      expect(body.todo.deletedAt).not.toBeNull();
    });

    it("returns 404 when deleting non-existent todo", async () => {
      (prisma.todo.findUnique as Mock).mockResolvedValue(null);

      const req = mockNextRequestWithParams("");
      const response = await DELETE(req, { params: { id: "missing" } });

      expect(response.status).toBe(404);
    });
  });

  describe("Unauthenticated requests", () => {
    it("returns 401 when no session", async () => {
      (auth as Mock).mockResolvedValue(null);
      const req = mockNextRequest();
      const response = await GET(req);
      expect(response.status).toBe(401);
    });
  });
});
