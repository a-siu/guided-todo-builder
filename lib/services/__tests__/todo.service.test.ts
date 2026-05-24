import { Mock, vi } from "vitest";
import { todoService } from "../todo.service";
import { todoRepository } from "@/lib/repositories/todo.repository";
import { cacheService } from "../cache.service";
import { auditService } from "../audit.service";
import * as validation from "@/lib/validation/todo.validation";

vi.mock("@/lib/repositories/todo.repository", () => ({
  todoRepository: {
    findActiveTodos: vi.fn(),
    findTodoById: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    findMostRecentTodo: vi.fn(),
  },
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

vi.mock("../cache.service", () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
  },
}));

vi.mock("../audit.service", () => ({
  auditService: {
    softDelete: vi.fn(),
  },
}));

vi.mock("@/lib/validation/todo.validation", () => ({
  validateTodoInput: vi.fn(),
  validateUpdateInput: vi.fn(),
}));

const userId = "user-1";

describe("todoService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gets todos from cache on hit", async () => {
    (cacheService.get as Mock).mockReturnValue([{ id: "1" }]);
    const result = await todoService.getTodos(userId);
    expect(result).toEqual([{ id: "1" }]);
    expect(todoRepository.findActiveTodos).not.toHaveBeenCalled();
  });

  it("gets todos from DB on cache miss", async () => {
    (cacheService.get as Mock).mockReturnValue(null);
    (todoRepository.findActiveTodos as Mock).mockResolvedValue([{ id: "1" }]);
    const result = await todoService.getTodos(userId);
    expect(result).toEqual([{ id: "1" }]);
    expect(cacheService.set).toHaveBeenCalledWith(`todos:${userId}`, [{ id: "1" }]);
  });

  it("creates todo and invalidates cache", async () => {
    (validation.validateTodoInput as Mock).mockReturnValue({ valid: true });
    const mockTodo = { id: "1", title: "new", userId, createdAt: new Date() };
    (todoRepository.createTodo as Mock).mockResolvedValue(mockTodo);
    const { patternService: ps } = await import("@/lib/services/pattern.service");
    (ps.upsertPattern as Mock).mockResolvedValue({ id: "pat-1" });
    (ps.normalizeTitle as Mock).mockReturnValue({ hash: "abc", terms: [], stemmedTerms: [] });
    (todoRepository.findMostRecentTodo as Mock).mockResolvedValue(null);
    const result = await todoService.createTodo({ title: "new" }, userId);
    expect(result.todo?.title).toBe("new");
    expect(cacheService.invalidate).toHaveBeenCalledWith(`todos:${userId}`);
  });

  it("records prediction vectors on create", async () => {
    const mockTodo = { id: "1", title: "buy groceries", completed: false, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), userId: "user-1" };
    (validation.validateTodoInput as Mock).mockReturnValue({ valid: true });
    (todoRepository.createTodo as Mock).mockResolvedValue(mockTodo);

    const { patternService } = await import("@/lib/services/pattern.service");
    const { temporalService } = await import("@/lib/services/temporal.service");
    const { tfidfService } = await import("@/lib/services/tfidf.service");
    const { transitionService } = await import("@/lib/services/transition.service");

    (patternService.upsertPattern as Mock).mockResolvedValue({ id: "pat-1" });
    (patternService.normalizeTitle as Mock).mockReturnValue({ hash: "abc", terms: ["groceries"], stemmedTerms: ["groceri"] });
    (todoRepository.findMostRecentTodo as Mock).mockResolvedValue(null);

    await todoService.createTodo({ title: "buy groceries" }, "user-1");

    expect(patternService.upsertPattern).toHaveBeenCalledWith("user-1", mockTodo.title);
    expect(temporalService.recordTime).toHaveBeenCalledWith("pat-1", mockTodo.createdAt);
    expect(tfidfService.updateTermDf).toHaveBeenCalledWith("user-1", ["groceri"]);
    expect(tfidfService.assignToCluster).toHaveBeenCalledWith("user-1", "pat-1", ["groceri"]);
    expect(transitionService.recordTransition).not.toHaveBeenCalled();
  });

  it("rejects invalid input on create", async () => {
    (validation.validateTodoInput as Mock).mockReturnValue({ valid: false, error: "Title is required" });
    const result = await todoService.createTodo({ title: "" }, userId);
    expect(result.error).toBe("Title is required");
    expect(todoRepository.createTodo).not.toHaveBeenCalled();
  });

  it("updates todo and invalidates cache", async () => {
    (validation.validateUpdateInput as Mock).mockReturnValue({ valid: true });
    (todoRepository.findTodoById as Mock).mockResolvedValue({ id: "1", userId });
    (todoRepository.updateTodo as Mock).mockResolvedValue({ id: "1", title: "updated", userId });
    const result = await todoService.updateTodo("1", { title: "updated" }, userId);
    expect(result.todo?.title).toBe("updated");
    expect(cacheService.invalidate).toHaveBeenCalledWith(`todos:${userId}`);
  });

  it("returns 404 when updating non-existent todo", async () => {
    (validation.validateUpdateInput as Mock).mockReturnValue({ valid: true });
    (todoRepository.findTodoById as Mock).mockResolvedValue(null);
    const result = await todoService.updateTodo("999", { title: "updated" }, userId);
    expect(result.error).toBe("Todo not found");
  });

  it("returns 404 when updating another user's todo", async () => {
    (validation.validateUpdateInput as Mock).mockReturnValue({ valid: true });
    (todoRepository.findTodoById as Mock).mockResolvedValue({ id: "1", userId: "other-user" });
    const result = await todoService.updateTodo("1", { title: "hacked" }, userId);
    expect(result.error).toBe("Todo not found");
  });

  it("deletes todo via audit service and invalidates cache", async () => {
    (todoRepository.findTodoById as Mock).mockResolvedValue({ id: "1", userId });
    (auditService.softDelete as Mock).mockResolvedValue({ id: "1", deletedAt: new Date(), userId });
    const result = await todoService.deleteTodo("1", userId);
    expect(result.todo?.deletedAt).toBeDefined();
    expect(cacheService.invalidate).toHaveBeenCalledWith(`todos:${userId}`);
  });

  it("returns 404 when deleting non-existent todo", async () => {
    (todoRepository.findTodoById as Mock).mockResolvedValue(null);
    const result = await todoService.deleteTodo("999", userId);
    expect(result.error).toBe("Todo not found");
  });

  it("returns 404 when deleting another user's todo", async () => {
    (todoRepository.findTodoById as Mock).mockResolvedValue({ id: "1", userId: "other-user" });
    const result = await todoService.deleteTodo("1", userId);
    expect(result.error).toBe("Todo not found");
    expect(auditService.softDelete).not.toHaveBeenCalled();
  });

  it("rejects update with empty title", async () => {
    (validation.validateUpdateInput as Mock).mockReturnValue({ valid: false, error: "Title cannot be empty" });
    (todoRepository.findTodoById as Mock).mockResolvedValue({ id: "1", userId });
    const result = await todoService.updateTodo("1", { title: "" }, userId);
    expect(result.error).toBe("Title cannot be empty");
    expect(todoRepository.updateTodo).not.toHaveBeenCalled();
  });
});
