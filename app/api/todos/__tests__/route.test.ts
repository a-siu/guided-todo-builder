import { POST } from "../route";

describe("POST /api/todos", () => {
  it("returns 400 for malformed JSON", async () => {
    const request = {
      json: async () => { throw new SyntaxError("Unexpected end of JSON input"); },
    };
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });
});
