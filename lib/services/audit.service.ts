import { todoRepository } from "@/lib/repositories/todo.repository";
import { Todo } from "@/lib/types";

export const auditService = {
  async getDeletedTodos(userId: string): Promise<Todo[]> {
    return todoRepository.findDeletedTodos(userId);
  },

  async getAllTodos(userId: string): Promise<Todo[]> {
    return todoRepository.findAllTodos(userId);
  },

  async softDelete(id: string): Promise<Todo> {
    return todoRepository.updateTodo(id, { deletedAt: new Date() });
  },
};
