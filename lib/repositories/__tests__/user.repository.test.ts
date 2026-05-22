import { userRepository } from "../user.repository";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("userRepository", () => {
  beforeEach(() => jest.clearAllMocks());

  it("finds user by username", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "1", username: "test" });
    const result = await userRepository.findByUsername("test");
    expect(result?.username).toBe("test");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: "test" },
    });
  });

  it("returns null when user not found", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await userRepository.findByUsername("nonexistent");
    expect(result).toBeNull();
  });

  it("creates a user", async () => {
    const hash = "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12345";
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: "1", username: "newuser" });
    const result = await userRepository.createUser("newuser", hash);
    expect(result.username).toBe("newuser");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { username: "newuser", password: hash },
      select: { id: true, username: true },
    });
  });

  it("finds user by id", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "1", username: "test" });
    const result = await userRepository.findById("1");
    expect(result?.id).toBe("1");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
      select: { id: true, username: true },
    });
  });
});
