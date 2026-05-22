import { todoRepository } from "../todo.repository";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    todo: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const userId = "user-1";

describe("todoRepository", () => {
  beforeEach(() => jest.clearAllMocks());

  it("finds active todos for a user", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: null, userId }]);
    const result = await todoRepository.findActiveTodos(userId);
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, userId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds all todos for a user", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: null, userId }]);
    const result = await todoRepository.findAllTodos(userId);
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds deleted todos for a user", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: new Date(), userId }]);
    const result = await todoRepository.findDeletedTodos(userId);
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null }, userId },
      orderBy: { createdAt: "desc" },
    });
  });

  it("creates a todo for a user", async () => {
    (prisma.todo.create as jest.Mock).mockResolvedValue({ id: "1", title: "new", userId });
    const result = await todoRepository.createTodo({ title: "new" }, userId);
    expect(result.title).toBe("new");
    expect(prisma.todo.create).toHaveBeenCalledWith({
      data: { title: "new", userId },
    });
  });

  it("updates a todo", async () => {
    (prisma.todo.update as jest.Mock).mockResolvedValue({ id: "1", title: "updated", userId });
    const result = await todoRepository.updateTodo("1", { title: "updated" });
    expect(result.title).toBe("updated");
    expect(prisma.todo.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { title: "updated" },
    });
  });

  it("finds todo by id", async () => {
    (prisma.todo.findUnique as jest.Mock).mockResolvedValue({ id: "1", title: "test", userId });
    const result = await todoRepository.findTodoById("1");
    expect(result?.id).toBe("1");
    expect(prisma.todo.findUnique).toHaveBeenCalledWith({ where: { id: "1" } });
  });
});
