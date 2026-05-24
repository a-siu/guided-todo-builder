import { validateRegisterInput } from "../auth.validation";

describe("validateRegisterInput", () => {
  it("rejects empty username", () => {
    expect(validateRegisterInput({ username: "", password: "password123" })).toEqual({
      valid: false,
      error: "Username is required",
    });
  });

  it("rejects username under 3 chars", () => {
    expect(validateRegisterInput({ username: "ab", password: "password123" })).toEqual({
      valid: false,
      error: "Username must be between 3 and 50 characters",
    });
  });

  it("rejects username over 50 chars", () => {
    expect(validateRegisterInput({ username: "a".repeat(51), password: "password123" })).toEqual({
      valid: false,
      error: "Username must be between 3 and 50 characters",
    });
  });

  it("rejects empty password", () => {
    expect(validateRegisterInput({ username: "testuser", password: "" })).toEqual({
      valid: false,
      error: "Password is required",
    });
  });

  it("rejects password under 8 chars", () => {
    expect(validateRegisterInput({ username: "testuser", password: "short" })).toEqual({
      valid: false,
      error: "Password must be at least 8 characters",
    });
  });

  it("accepts valid input", () => {
    expect(validateRegisterInput({ username: "testuser", password: "password123" })).toEqual({
      valid: true,
    });
  });
});
