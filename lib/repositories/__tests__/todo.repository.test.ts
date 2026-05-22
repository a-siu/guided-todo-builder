import { todoRepository } from "../todo.repository";

// Mock prisma
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

describe("todoRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("finds all active todos", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: null }]);
    const result = await todoRepository.findActiveTodos();
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds all todos including deleted", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: new Date() }]);
    const result = await todoRepository.findAllTodos();
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });

  it("finds only deleted todos", async () => {
    (prisma.todo.findMany as jest.Mock).mockResolvedValue([{ id: "1", title: "test", deletedAt: new Date() }]);
    const result = await todoRepository.findDeletedTodos();
    expect(result).toHaveLength(1);
    expect(prisma.todo.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("creates a todo", async () => {
    (prisma.todo.create as jest.Mock).mockResolvedValue({ id: "1", title: "new" });
    const result = await todoRepository.createTodo({ title: "new" });
    expect(result.title).toBe("new");
    expect(prisma.todo.create).toHaveBeenCalledWith({
      data: { title: "new" },
    });
  });

  it("updates a todo", async () => {
    (prisma.todo.update as jest.Mock).mockResolvedValue({ id: "1", title: "updated" });
    const result = await todoRepository.updateTodo("1", { title: "updated" });
    expect(result.title).toBe("updated");
    expect(prisma.todo.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { title: "updated" },
    });
  });

  it("finds todo by id", async () => {
    (prisma.todo.findUnique as jest.Mock).mockResolvedValue({ id: "1", title: "test" });
    const result = await todoRepository.findTodoById("1");
    expect(result?.id).toBe("1");
    expect(prisma.todo.findUnique).toHaveBeenCalledWith({ where: { id: "1" } });
  });
});
