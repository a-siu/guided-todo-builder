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
