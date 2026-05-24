import bcrypt from "bcryptjs";
import { userRepository } from "@/lib/repositories/user.repository";
import { validateRegisterInput } from "@/lib/validation/auth.validation";
import { RegisterInput, AuthResponse } from "@/lib/types";

const SALT_ROUNDS = 10;

export const authService = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const validation = validateRegisterInput(input);
    if (!validation.valid) {
      return { error: validation.error };
    }

    const existing = await userRepository.findByUsername(input.username);
    if (existing) {
      return { error: "Username already taken" };
    }

    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await userRepository.createUser(input.username, hashedPassword);
    return { user };
  },

  async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  },
};
