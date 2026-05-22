import { todoRepository } from "@/lib/repositories/todo.repository";
import { Todo } from "@/lib/types";

export const auditService = {
  async getDeletedTodos(): Promise<Todo[]> {
    return todoRepository.findDeletedTodos();
  },

  async getAllTodos(): Promise<Todo[]> {
    return todoRepository.findAllTodos();
  },

  async softDelete(id: string): Promise<Todo> {
    return todoRepository.updateTodo(id, { deletedAt: new Date() });
  },
};
