import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/transition.repository", () => ({
  transitionRepository: {
    upsertTransition: vi.fn(),
    findTopTransitions: vi.fn(),
  },
}));

import { transitionService } from "@/lib/services/transition.service";
import { transitionRepository } from "@/lib/repositories/transition.repository";

describe("transitionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a transition between two patterns", async () => {
    await transitionService.recordTransition("user-1", "pat-1", "pat-2");

    expect(transitionRepository.upsertTransition).toHaveBeenCalledWith("user-1", "pat-1", "pat-2");
  });

  it("finds top follow-up patterns", async () => {
    const mockResult = [{ toPattern: { id: "pat-2", userId: "user-1", titleHash: "def", rawTitle: "cook dinner", frequency: 3, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }, count: 2 }];
    (transitionRepository.findTopTransitions as Mock).mockResolvedValue(mockResult);

    const result = await transitionService.getTopFollowUps("user-1", "pat-1", 3);

    expect(transitionRepository.findTopTransitions).toHaveBeenCalledWith("user-1", "pat-1", 3);
    expect(result).toEqual(mockResult);
  });
});
