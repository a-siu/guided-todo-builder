import { Mock, vi } from "vitest";
import { GET } from "../route";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "test-user" } }),
}));

vi.mock("@/lib/services/prediction.service", () => ({
  predictionService: {
    predict: vi.fn(),
  },
}));

import { predictionService } from "@/lib/services/prediction.service";

describe("GET /api/predictions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes query param to predictionService.predict", async () => {
    (predictionService.predict as Mock).mockResolvedValue([]);

    const request = new Request("http://localhost/api/predictions?query=milk");
    await GET(request as any);

    expect(predictionService.predict).toHaveBeenCalledWith("test-user", { query: "milk" });
  });

  it("omits query when not provided", async () => {
    (predictionService.predict as Mock).mockResolvedValue([]);

    const request = new Request("http://localhost/api/predictions");
    await GET(request as any);

    expect(predictionService.predict).toHaveBeenCalledWith("test-user", {});
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth/config");
    (auth as Mock).mockResolvedValue(null);

    const request = new Request("http://localhost/api/predictions");
    const response = await GET(request as any);

    expect(response.status).toBe(401);
  });
});
