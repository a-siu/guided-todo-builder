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
