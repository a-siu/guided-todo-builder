import { todoRepository } from "@/lib/repositories/todo.repository";
import { cacheService } from "./cache.service";
import { auditService } from "./audit.service";
import { predictionOrchestrator } from "./prediction-orchestrator.service";
import { validateTodoInput, validateUpdateInput } from "@/lib/validation/todo.validation";
import { CreateTodoInput, UpdateTodoInput, ApiResponse, Todo } from "@/lib/types";

export const todoService = {
  async getTodos(userId: string): Promise<Todo[]> {
    const cacheKey = `todos:${userId}`;
    const cached = cacheService.get<Todo[]>(cacheKey);
    if (cached) return cached;

    const todos = await todoRepository.findActiveTodos(userId);
    cacheService.set(cacheKey, todos);
    return todos;
  },

  async getTodoById(id: string): Promise<Todo | null> {
    return todoRepository.findTodoById(id);
  },

  async createTodo(input: CreateTodoInput, userId: string): Promise<ApiResponse<Todo>> {
    const validation = validateTodoInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const todo = await todoRepository.createTodo(input, userId);
    cacheService.invalidate(`todos:${userId}`);

    try {
      await predictionOrchestrator.onTodoCreated(todo, userId);
    } catch {
      // Prediction side effects are non-critical; todo was already saved
    }

    return { todo };
  },

  async updateTodo(id: string, input: UpdateTodoInput, userId: string): Promise<ApiResponse<Todo>> {
    const validation = validateUpdateInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const existing = await todoRepository.findTodoById(id);
    if (!existing || existing.userId !== userId) {
      return { error: "Todo not found" };
    }

    const todo = await todoRepository.updateTodo(id, input);
    cacheService.invalidate(`todos:${userId}`);
    return { todo };
  },

  async deleteTodo(id: string, userId: string): Promise<ApiResponse<Todo>> {
    const existing = await todoRepository.findTodoById(id);
    if (!existing || existing.userId !== userId) {
      return { error: "Todo not found" };
    }

    const todo = await auditService.softDelete(id);
    cacheService.invalidate(`todos:${userId}`);
    return { todo };
  },
};
