import { Mock, vi } from "vitest";

const mockHash = vi.hoisted(() => vi.fn());
const mockCompare = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/user.repository", () => ({
  userRepository: {
    findByUsername: vi.fn(),
    createUser: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: mockHash, compare: mockCompare },
  hash: mockHash,
  compare: mockCompare,
}));

import { authService } from "@/lib/auth/service";
import { userRepository } from "@/lib/repositories/user.repository";
import bcrypt from "bcryptjs";

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("creates user with hashed password", async () => {
      (userRepository.findByUsername as Mock).mockResolvedValue(null);
      mockHash.mockResolvedValue("$2b$10$hashedpassword1234567890123456789012345678901234567890");
      (userRepository.createUser as Mock).mockResolvedValue({ id: "1", username: "newuser" });

      const result = await authService.register({ username: "newuser", password: "password123" });

      expect(result.user?.username).toBe("newuser");
      expect(mockHash).toHaveBeenCalledWith("password123", 10);
    });

    it("rejects duplicate username", async () => {
      (userRepository.findByUsername as Mock).mockResolvedValue({ id: "1", username: "existing" });

      const result = await authService.register({ username: "existing", password: "password123" });

      expect(result.error).toBe("Username already taken");
      expect(userRepository.createUser).not.toHaveBeenCalled();
    });

    it("rejects invalid input", async () => {
      const result = await authService.register({ username: "ab", password: "short" });

      expect(result.error).toBeDefined();
      expect(userRepository.createUser).not.toHaveBeenCalled();
    });
  });

  describe("verifyPassword", () => {
    it("returns true for correct password", async () => {
      mockCompare.mockResolvedValue(true);
      const result = await authService.verifyPassword("password123", "$2b$10$hash");
      expect(result).toBe(true);
    });

    it("returns false for wrong password", async () => {
      mockCompare.mockResolvedValue(false);
      const result = await authService.verifyPassword("wrong", "$2b$10$hash");
      expect(result).toBe(false);
    });
  });
});
