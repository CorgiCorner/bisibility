import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "InstallPageContent.tsx"), "utf8");

describe("InstallPageContent feature-message boundary", () => {
  it("is a client island, so projectInstall resolves from the route payload", () => {
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain('useTranslations("projectInstall")');
    expect(source).toContain("useFormatter()");
  });
});
