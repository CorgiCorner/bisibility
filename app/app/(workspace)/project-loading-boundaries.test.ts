import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("project loading boundaries", () => {
  it("keeps a shell-shaped fallback above the layouts that render the shell", () => {
    // app/app/layout.tsx is async, so without this boundary a cold load falls back outside
    // the app segment and paints no sidebar and no header at all.
    expect(existsSync(resolve(import.meta.dirname, "..", "loading.tsx"))).toBe(true);
  });

  it("keeps the Backlinks fallback inside the project shell", () => {
    expect(existsSync(resolve(import.meta.dirname, "[project]", "backlinks", "loading.tsx"))).toBe(
      true,
    );
    expect(existsSync(resolve(import.meta.dirname, "backlinks", "loading.tsx"))).toBe(false);
  });
});
