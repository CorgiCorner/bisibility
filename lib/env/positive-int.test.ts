import { describe, expect, it } from "vitest";
import { positiveIntFromEnv } from "./positive-int";

describe("positiveIntFromEnv", () => {
  it("accepts a positive integer", () => {
    expect(positiveIntFromEnv("42", 7)).toBe(42);
  });

  it.each([undefined, "", "0", "-1", "invalid"])("falls back for %s", (value) => {
    expect(positiveIntFromEnv(value, 7)).toBe(7);
  });
});
