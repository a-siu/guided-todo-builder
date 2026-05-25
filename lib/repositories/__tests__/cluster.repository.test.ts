import { Mock, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    termDf: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    cluster: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { clusterRepository } from "@/lib/repositories/cluster.repository";

describe("clusterRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a term DF counter", async () => {
    const mockTermDf = { id: "td-1", userId: "user-1", term: "groceri", df: 1 };
    (prisma.termDf.upsert as Mock).mockResolvedValue(mockTermDf);

    const result = await clusterRepository.upsertTermDf("user-1", "groceri");

    expect(prisma.termDf.upsert).toHaveBeenCalledWith({
      where: { userId_term: { userId: "user-1", term: "groceri" } },
      create: { userId: "user-1", term: "groceri" },
      update: { df: { increment: 1 } },
    });
    expect(result).toEqual(mockTermDf);
  });

  it("gets term DFs for a user", async () => {
    const mockTerms = [{ id: "td-1", userId: "user-1", term: "groceri", df: 5 }];
    (prisma.termDf.findMany as Mock).mockResolvedValue(mockTerms);

    const result = await clusterRepository.getTermDfs("user-1");

    expect(prisma.termDf.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockTerms);
  });

  it("finds clusters by userId", async () => {
    const mockClusters = [{ id: "cl-1", userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1, createdAt: new Date(), updatedAt: new Date() }];
    (prisma.cluster.findMany as Mock).mockResolvedValue(mockClusters);

    const result = await clusterRepository.findClusters("user-1");

    expect(prisma.cluster.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(result).toEqual(mockClusters);
  });

  it("creates a cluster", async () => {
    const mockCluster = { id: "cl-1", userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1, createdAt: new Date(), updatedAt: new Date() };
    (prisma.cluster.create as Mock).mockResolvedValue(mockCluster);

    const result = await clusterRepository.createCluster("user-1", { groceri: 0.5 });

    expect(prisma.cluster.create).toHaveBeenCalledWith({
      data: { userId: "user-1", centroid: { groceri: 0.5 }, memberCount: 1 },
    });
    expect(result).toEqual(mockCluster);
  });

  it("updates a cluster centroid", async () => {
    const mockCluster = { id: "cl-1", userId: "user-1", centroid: { groceri: 0.6 }, memberCount: 2, createdAt: new Date(), updatedAt: new Date() };
    (prisma.cluster.update as Mock).mockResolvedValue(mockCluster);

    const result = await clusterRepository.updateClusterCentroid("cl-1", { groceri: 0.6 }, 2);

    expect(prisma.cluster.update).toHaveBeenCalledWith({
      where: { id: "cl-1" },
      data: { centroid: { groceri: 0.6 }, memberCount: 2 },
    });
    expect(result).toEqual(mockCluster);
  });
});
