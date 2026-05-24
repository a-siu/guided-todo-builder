import { prisma } from "@/lib/prisma";
import { AuthUser } from "@/lib/types";

export const userRepository = {
  async findByUsername(username: string): Promise<{ id: string; username: string; password: string } | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  },

  async findById(id: string): Promise<AuthUser | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });
  },

  async createUser(username: string, hashedPassword: string): Promise<AuthUser> {
    return prisma.user.create({
      data: { username, password: hashedPassword },
      select: { id: true, username: true },
    });
  },
};
