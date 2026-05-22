import { prisma } from "@/lib/prisma";
import { CreateTodoInput, UpdateTodoInput, Todo } from "@/lib/types";

export const todoRepository = {
  async findActiveTodos(userId: string): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: null, userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findAllTodos(userId: string): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findDeletedTodos(userId: string): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: { not: null }, userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findTodoById(id: string): Promise<Todo | null> {
    return prisma.todo.findUnique({
      where: { id },
    });
  },

  async createTodo(input: CreateTodoInput, userId: string): Promise<Todo> {
    return prisma.todo.create({
      data: { title: input.title, userId },
    });
  },

  async updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
    return prisma.todo.update({
      where: { id },
      data: input,
    });
  },
};
