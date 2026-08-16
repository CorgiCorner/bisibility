import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first two name parts", () => {
    expect(initials("John Doe", "john@example.com")).toBe("JD");
  });

  it("falls back to email when name is empty", () => {
    expect(initials("", "john@example.com")).toBe("JE");
  });

  it("trims whitespace before splitting", () => {
    expect(initials("  Jane  Smith  ", "jane@example.com")).toBe("JS");
  });

  it("uppercases the result", () => {
    expect(initials("john doe", "john@example.com")).toBe("JD");
  });

  it("returns U when both name and email are empty", () => {
    expect(initials("", "")).toBe("U");
  });

  it("splits on dots, hyphens, and underscores, not just spaces", () => {
    expect(initials("john.doe", "john@example.com")).toBe("JD");
    expect(initials("john-doe", "john@example.com")).toBe("JD");
    expect(initials("john_doe", "john@example.com")).toBe("JD");
  });

  it("uses only the first two parts even with many separators", () => {
    expect(initials("John Michael Patrick Doe", "john@example.com")).toBe("JM");
  });

  it("returns U for a single-character name", () => {
    expect(initials("J", "j@example.com")).toBe("J");
  });
});
