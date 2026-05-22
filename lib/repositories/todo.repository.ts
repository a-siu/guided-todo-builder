import { prisma } from "@/lib/prisma";
import { CreateTodoInput, UpdateTodoInput, Todo } from "@/lib/types";

export const todoRepository = {
  async findActiveTodos(): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  async findAllTodos(): Promise<Todo[]> {
    return prisma.todo.findMany({
      orderBy: { createdAt: "desc" },
    });
  },

  async findDeletedTodos(): Promise<Todo[]> {
    return prisma.todo.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });
  },

  async findTodoById(id: string): Promise<Todo | null> {
    return prisma.todo.findUnique({
      where: { id },
    });
  },

  async createTodo(input: CreateTodoInput): Promise<Todo> {
    return prisma.todo.create({
      data: { title: input.title },
    });
  },

  async updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
    return prisma.todo.update({
      where: { id },
      data: input,
    });
  },
};
