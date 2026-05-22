import { RegisterInput } from "@/lib/types";

export function validateRegisterInput(input: RegisterInput): { valid: boolean; error?: string } {
  if (!input.username || input.username.trim().length === 0) {
    return { valid: false, error: "Username is required" };
  }
  if (input.username.length < 3 || input.username.length > 50) {
    return { valid: false, error: "Username must be between 3 and 50 characters" };
  }
  if (!input.password || input.password.length === 0) {
    return { valid: false, error: "Password is required" };
  }
  if (input.password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  return { valid: true };
}
