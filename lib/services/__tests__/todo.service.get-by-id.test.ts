import { todoService } from "../todo.service";
import { todoRepository } from "@/lib/repositories/todo.repository";
import { cacheService } from "../cache.service";

jest.mock("@/lib/repositories/todo.repository", () => ({
  todoRepository: {
    findTodoById: jest.fn(),
  },
}));

jest.mock("../cache.service", () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
}));

describe("todoService.getTodoById", () => {
  it("returns todo found by id", async () => {
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue({ id: "1", title: "test", deletedAt: null, completed: false, createdAt: new Date(), updatedAt: new Date() });
    const result = await todoService.getTodoById("1");
    expect(result?.id).toBe("1");
  });

  it("returns null when not found", async () => {
    (todoRepository.findTodoById as jest.Mock).mockResolvedValue(null);
    const result = await todoService.getTodoById("999");
    expect(result).toBeNull();
  });
});
