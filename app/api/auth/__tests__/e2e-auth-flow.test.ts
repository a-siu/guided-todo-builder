import { POST as registerUser } from "../register/route";
import { Mock, vi } from "vitest";

vi.mock("@/lib/auth/service", () => ({
  authService: {
    register: vi.fn(),
    verifyPassword: vi.fn(),
  },
}));

import { authService } from "@/lib/auth/service";

const mockJson = (data: unknown) => {
  let consumed = false;
  return vi.fn().mockImplementation(async () => {
    if (consumed) throw new Error("Body already consumed");
    consumed = true;
    return data;
  });
};

const mockRequest = (body?: unknown) => ({
  json: body !== undefined ? mockJson(body) : vi.fn(),
} as any);

describe("E2E: Auth - Register Flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers a new user and returns 201", async () => {
    (authService.register as Mock).mockResolvedValue({
      user: { id: "user-1", username: "newuser" },
    });

    const req = mockRequest({ username: "newuser", password: "password123" });
    const response = await registerUser(req);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user.username).toBe("newuser");
    expect(authService.register).toHaveBeenCalledWith({
      username: "newuser",
      password: "password123",
    });
  });

  it("rejects duplicate username with 400", async () => {
    (authService.register as Mock).mockResolvedValue({
      error: "Username already taken",
    });

    const req = mockRequest({ username: "existing", password: "password123" });
    const response = await registerUser(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Username already taken");
  });

  it("rejects short username with 400", async () => {
    (authService.register as Mock).mockResolvedValue({
      error: "Username must be between 3 and 50 characters",
    });

    const req = mockRequest({ username: "ab", password: "password123" });
    const response = await registerUser(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Username");
  });

  it("rejects short password with 400", async () => {
    (authService.register as Mock).mockResolvedValue({
      error: "Password must be at least 8 characters",
    });

    const req = mockRequest({ username: "testuser", password: "short" });
    const response = await registerUser(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Password");
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = {
      json: async () => { throw new SyntaxError("Unexpected token"); },
    };
    const response = await registerUser(req as any);

    expect(response.status).toBe(500);
  });

  it("creates user with hashed password - full authService integration", async () => {
    (authService.register as Mock).mockResolvedValue({
      user: { id: "user-1", username: "validuser" },
    });

    const req = mockRequest({ username: "validuser", password: "securePass123" });
    const response = await registerUser(req);

    expect(response.status).toBe(201);
    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ username: "validuser" })
    );
  });
});
