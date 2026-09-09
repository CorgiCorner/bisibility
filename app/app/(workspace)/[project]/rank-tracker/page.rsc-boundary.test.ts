import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(import.meta.dirname, "page.tsx"), "utf8");

describe("RankTrackerPage Runs RSC boundary", () => {
  it("keeps the legacy Runs migration server-only", () => {
    expect(pageSource).not.toContain("RankTrackerRunsTab");
    expect(pageSource).toContain("redirect(legacyRunsDestination(publicId, params))");
  });
});
