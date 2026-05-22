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
    (validation.validateTodoInput as jest.Mock).mockReturnValue({ valid: true });
    (todoRepository.createTodo as jest.Mock).mockResolvedValue({ id: "1", title: "new" });
    const result = await todoService.createTodo({ title: "new" });
    expect(result.todo?.title).toBe("new");
    expect(cacheService.invalidate).toHaveBeenCalledWith("todos");
  });

  it("rejects invalid input on create", async () => {
    (validation.validateTodoInput as jest.Mock).mockReturnValue({ valid: false, error: "Title is required" });
    const result = await todoService.createTodo({ title: "" });
    expect(result.error).toBe("Title is required");
    expect(todoRepository.createTodo).not.toHaveBeenCalled();
  });

  it("updates todo and invalidates cache", async () => {
    (validation.validateUpdateInput as jest.Mock).mockReturnValue({ valid: true });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1" });
    (todoRepository.updateTodo as jest.Mock).mockResolvedValue({ id: "1", title: "updated" });
    const result = await todoService.updateTodo("1", { title: "updated" });
    expect(result.todo?.title).toBe("updated");
    expect(cacheService.invalidate).toHaveBeenCalledWith("todos");
  });

  it("returns 404 when updating non-existent todo", async () => {
    (validation.validateUpdateInput as jest.Mock).mockReturnValue({ valid: true });
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

  it("rejects update with empty title", async () => {
    (validation.validateUpdateInput as jest.Mock).mockReturnValue({ valid: false, error: "Title cannot be empty" });
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1" });
    const result = await todoService.updateTodo("1", { title: "" });
    expect(result.error).toBe("Title cannot be empty");
    expect(todoRepository.updateTodo).not.toHaveBeenCalled();
  });
});
