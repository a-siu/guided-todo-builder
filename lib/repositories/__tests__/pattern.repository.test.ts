import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pattern: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { patternRepository } from "@/lib/repositories/pattern.repository";

describe("patternRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a pattern", async () => {
    const mockPattern = {
      id: "pat-1",
      userId: "user-1",
      titleHash: "abc123",
      rawTitle: "buy groceries",
      frequency: 1,
      clusterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (prisma.pattern.upsert as Mock).mockResolvedValue(mockPattern);

    const result = await patternRepository.upsertPattern("user-1", "abc123", "buy groceries");

    expect(prisma.pattern.upsert).toHaveBeenCalledWith({
      where: { userId_titleHash: { userId: "user-1", titleHash: "abc123" } },
      create: { userId: "user-1", titleHash: "abc123", rawTitle: "buy groceries" },
      update: { rawTitle: "buy groceries", frequency: { increment: 1 } },
    });
    expect(result).toEqual(mockPattern);
  });

  it("finds patterns by cluster", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.pattern.findMany as Mock).mockResolvedValue(mockPatterns);

    const result = await patternRepository.findPatternsByCluster("cl-1", 5);

    expect(prisma.pattern.findMany).toHaveBeenCalledWith({
      where: { clusterId: "cl-1" },
      orderBy: { frequency: "desc" },
      take: 5,
    });
    expect(result).toEqual(mockPatterns);
  });

  it("finds a pattern by id", async () => {
    const mockPattern = { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() };
    (prisma.pattern.findFirst as Mock).mockResolvedValue(mockPattern);

    const result = await patternRepository.findPatternById("pat-1");

    expect(prisma.pattern.findFirst).toHaveBeenCalledWith({ where: { id: "pat-1" } });
    expect(result).toEqual(mockPattern);
  });

  it("gets all patterns for a user", async () => {
    const mockPatterns = [{ id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }];
    (prisma.pattern.findMany as Mock).mockResolvedValue(mockPatterns);

    const result = await patternRepository.getAllPatterns("user-1");

    expect(prisma.pattern.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockPatterns);
  });

  it("updates pattern cluster assignment", async () => {
    (prisma.pattern.update as Mock).mockResolvedValue(null);

    await patternRepository.assignPatternToCluster("pat-1", "cl-1");

    expect(prisma.pattern.update).toHaveBeenCalledWith({
      where: { id: "pat-1" },
      data: { clusterId: "cl-1" },
    });
  });
});
