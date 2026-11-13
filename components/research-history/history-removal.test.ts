import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const removed = [
  "components/keywords/serp-playground/PlaygroundHistoryDialog.tsx",
  "components/keywords/serp-playground/RecentPlaygroundQueries.tsx",
  "components/research/RecentResearchSearches.tsx",
  "components/research/useRecentSearches.ts",
  "lib/actions/serp-playground-history.ts",
  "lib/keyword-research/recent-searches.ts",
];

describe("replaced history surfaces", () => {
  it("removes the old history list, dialog and browser-only recent store", () => {
    for (const path of removed) expect(existsSync(path), path).toBe(false);
    const results = readFileSync("components/ai-research/ModelPlaygroundResults.tsx", "utf8");
    expect(results).not.toContain("AiResearchHistory");
    expect(results).toContain("ModelPlaygroundHistoryButton");
  });
});
