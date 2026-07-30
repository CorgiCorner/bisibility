import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("project loading boundaries", () => {
  it("keeps the Backlinks fallback inside the project shell", () => {
    expect(existsSync(resolve(import.meta.dirname, "[project]", "backlinks", "loading.tsx"))).toBe(
      true,
    );
    expect(existsSync(resolve(import.meta.dirname, "backlinks", "loading.tsx"))).toBe(false);
  });
});
