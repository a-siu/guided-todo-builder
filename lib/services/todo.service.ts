import { todoRepository } from "@/lib/repositories/todo.repository";
import { cacheService } from "./cache.service";
import { auditService } from "./audit.service";
import { validateTodoInput, validateUpdateInput } from "@/lib/validation/todo.validation";
import { CreateTodoInput, UpdateTodoInput, ApiResponse, Todo } from "@/lib/types";

const TODOS_CACHE_KEY = "todos";

export const todoService = {
  async getTodos(): Promise<Todo[]> {
    const cached = cacheService.get<Todo[]>(TODOS_CACHE_KEY);
    if (cached) return cached;

    const todos = await todoRepository.findActiveTodos();
    cacheService.set(TODOS_CACHE_KEY, todos);
    return todos;
  },

  async getTodoById(id: string): Promise<Todo | null> {
    return todoRepository.findTodoById(id);
  },

  async createTodo(input: CreateTodoInput): Promise<ApiResponse<Todo>> {
    const validation = validateTodoInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const todo = await todoRepository.createTodo(input);
    cacheService.invalidate(TODOS_CACHE_KEY);
    return { todo };
  },

  async updateTodo(id: string, input: UpdateTodoInput): Promise<ApiResponse<Todo>> {
    const validation = validateUpdateInput(input);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    const existing = await todoRepository.findTodoById(id);
    if (!existing) {
      return { error: "Todo not found" };
    }

    const todo = await todoRepository.updateTodo(id, input);
    cacheService.invalidate(TODOS_CACHE_KEY);
    return { todo };
  },

  async deleteTodo(id: string): Promise<ApiResponse<Todo>> {
    const existing = await todoRepository.findTodoById(id);
    if (!existing) {
      return { error: "Todo not found" };
    }

    const todo = await auditService.softDelete(id);
    cacheService.invalidate(TODOS_CACHE_KEY);
    return { todo };
  },
};
