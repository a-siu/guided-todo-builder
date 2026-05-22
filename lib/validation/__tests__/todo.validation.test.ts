import { validateTodoInput, validateUpdateInput } from "../todo.validation";

describe("validateTodoInput", () => {
  it("rejects empty title", () => {
    expect(validateTodoInput({ title: "" })).toEqual({
      valid: false,
      error: "Title is required",
    });
  });

  it("rejects title over 200 chars", () => {
    expect(validateTodoInput({ title: "a".repeat(201) })).toEqual({
      valid: false,
      error: "Title must be 200 characters or less",
    });
  });

  it("accepts valid title", () => {
    expect(validateTodoInput({ title: "Buy groceries" })).toEqual({
      valid: true,
    });
  });
});

describe("validateUpdateInput", () => {
  it("rejects empty title on update", () => {
    expect(validateUpdateInput({ title: "" })).toEqual({
      valid: false,
      error: "Title cannot be empty",
    });
  });

  it("rejects title over 200 chars on update", () => {
    expect(validateUpdateInput({ title: "a".repeat(201) })).toEqual({
      valid: false,
      error: "Title must be 200 characters or less",
    });
  });

  it("accepts valid update with title", () => {
    expect(validateUpdateInput({ title: "Updated title" })).toEqual({
      valid: true,
    });
  });

  it("accepts valid update with completed", () => {
    expect(validateUpdateInput({ completed: true })).toEqual({
      valid: true,
    });
  });
});
