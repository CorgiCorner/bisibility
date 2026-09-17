import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "GettingStartedHeaderProgress.tsx"),
  "utf8",
);

describe("GettingStartedHeaderProgress feature-message boundary", () => {
  it("is a client island, so projectGettingStarted resolves from the route payload", () => {
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain('useTranslations("projectGettingStarted.header")');
  });
});
