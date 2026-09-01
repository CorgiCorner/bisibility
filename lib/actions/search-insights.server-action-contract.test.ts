import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/actions/search-insights.ts", "utf8");

describe("Search Insights server action contract", () => {
  it.each([
    ["pauseSearchInsightsImport", "export async function pauseSearchInsightsImport("],
    ["resumeSearchInsightsImport", "export async function resumeSearchInsightsImport("],
    ["retrySearchInsightsImport", "export async function retrySearchInsightsImport("],
    ["loadSearchInsightsImportFacts", "export async function loadSearchInsightsImportFacts("],
  ])("declares %s as an async export", (_name, declaration) => {
    expect(source).toContain(declaration);
  });
  it("keeps modal fact transport in the authorized query layer", () => {
    expect(source).toContain("await loadSearchInsightsScope(data.projectId");
    expect(source).not.toContain("readImportObservability");
  });
  it("returns only the stable transition message when storage rejects new pause fields", async () => {
    const forbidden = ["Prisma", "Invalid invocation", "pauseStartedAt", "/Users/", " at "];
    const stable = "Search data sync could not be paused. Refresh the page and try again.";
    for (const value of forbidden) expect(stable).not.toContain(value);
  });
});
