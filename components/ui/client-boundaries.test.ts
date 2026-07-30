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
    return source.includes('from "@phosphor-icons/react"');
  });

describe("UI client boundaries", () => {
  it.each(browserIconModules)("marks %s as a client module", (fileName) => {
    const source = readFileSync(resolve(import.meta.dirname, fileName), "utf8");

    expect(source.trimStart()).toMatch(/^"use client";/);
  });
});
