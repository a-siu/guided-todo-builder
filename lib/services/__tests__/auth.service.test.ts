import { authService } from "@/lib/auth/service";
import { userRepository } from "@/lib/repositories/user.repository";
import bcrypt from "bcryptjs";

jest.mock("@/lib/repositories/user.repository", () => ({
  userRepository: {
    findByUsername: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe("authService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("register", () => {
    it("creates user with hashed password", async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("$2b$10$hashedpassword1234567890123456789012345678901234567890");
      (userRepository.createUser as jest.Mock).mockResolvedValue({ id: "1", username: "newuser" });

      const result = await authService.register({ username: "newuser", password: "password123" });

      expect(result.user?.username).toBe("newuser");
      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
    });

    it("rejects duplicate username", async () => {
      (userRepository.findByUsername as jest.Mock).mockResolvedValue({ id: "1", username: "existing" });

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
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result = await authService.verifyPassword("password123", "$2b$10$hash");
      expect(result).toBe(true);
    });

    it("returns false for wrong password", async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const result = await authService.verifyPassword("wrong", "$2b$10$hash");
      expect(result).toBe(false);
    });
  });
});
