import { CreateTodoInput, UpdateTodoInput } from "@/lib/types";

export function validateTodoInput(input: CreateTodoInput): { valid: boolean; error?: string } {
  if (!input.title || input.title.trim().length === 0) {
    return { valid: false, error: "Title is required" };
  }
  if (input.title.length > 200) {
    return { valid: false, error: "Title must be 200 characters or less" };
  }
  return { valid: true };
}

export function validateUpdateInput(input: UpdateTodoInput): { valid: boolean; error?: string } {
  if (input.title !== undefined) {
    if (input.title.trim().length === 0) {
      return { valid: false, error: "Title cannot be empty" };
    }
    if (input.title.length > 200) {
      return { valid: false, error: "Title must be 200 characters or less" };
    }
  }
  return { valid: true };
}
