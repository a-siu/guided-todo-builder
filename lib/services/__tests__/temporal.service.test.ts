import { Mock, vi } from "vitest";

vi.mock("@/lib/repositories/temporal.repository", () => ({
  temporalRepository: {
    upsertTemporal: vi.fn(),
    findTopTemporal: vi.fn(),
  },
}));

import { temporalService } from "@/lib/services/temporal.service";
import { temporalRepository } from "@/lib/repositories/temporal.repository";

describe("temporalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records time with correct hour and day buckets", async () => {
    const date = new Date("2026-05-25T14:30:00Z");
    await temporalService.recordTime("pat-1", date);

    expect(temporalRepository.upsertTemporal).toHaveBeenCalledWith("pat-1", 14, 1);
  });

  it("finds top patterns for a time slot", async () => {
    const mockResult = [{ pattern: { id: "pat-1", userId: "user-1", titleHash: "abc", rawTitle: "buy groceries", frequency: 5, clusterId: "cl-1", createdAt: new Date(), updatedAt: new Date() }, count: 3 }];
    (temporalRepository.findTopTemporal as Mock).mockResolvedValue(mockResult);

    const date = new Date("2026-05-25T09:00:00Z");
    const result = await temporalService.getTopForTimeSlot("user-1", date, 3);

    expect(temporalRepository.findTopTemporal).toHaveBeenCalledWith("user-1", 9, 1, 3);
    expect(result).toEqual(mockResult);
  });
});
