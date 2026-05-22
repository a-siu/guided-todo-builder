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

describe("auditService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gets deleted todos", async () => {
    (todoRepository.findDeletedTodos as jest.Mock).mockResolvedValue([
      { id: "1", deletedAt: new Date() },
    ]);
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
    (todoRepository.updateTodo as jest.Mock).mockImplementation(
      async       (_id: string, data: UpdateTodoInput) => ({
        id: "1",
        ...data,
      })
    );
    const result = await auditService.softDelete("1");
    expect(todoRepository.updateTodo).toHaveBeenCalledWith("1", {
      deletedAt: expect.any(Date),
    });
    expect(result.deletedAt).toBeDefined();
  });
});
