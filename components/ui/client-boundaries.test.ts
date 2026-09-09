import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const browserIconModules = readdirSync(import.meta.dirname)
  .filter(
    (fileName) =>
      fileName.endsWith(".tsx") && !fileName.includes(".test.") && !fileName.includes(".stories."),
  )
  .filter((fileName) => {
    const source = readFileSync(resolve(import.meta.dirname, fileName), "utf8");
    return source.split(";").some((statement) => {
      const importStatement = statement.trimStart();

      return (
        importStatement.startsWith("import ") &&
        !importStatement.startsWith("import type ") &&
        /from ["']@phosphor-icons\/react(?:\/dist\/csr(?:\/[^"']+)?)?["']/.test(importStatement)
      );
    });
  });

describe("UI client boundaries", () => {
  it("checks a non-empty set of browser icon modules", () => {
    expect(browserIconModules.length).toBeGreaterThan(0);
  });

  it.each(browserIconModules)("marks %s as a client module", (fileName) => {
    const source = readFileSync(resolve(import.meta.dirname, fileName), "utf8");

    expect(source.trimStart()).toMatch(/^"use client";/);
  });
});
