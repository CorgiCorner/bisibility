import { checkTopDepthLabel, emptyRankCopy } from "@/components/keywords/KeywordPendingEmptyState";
import { describe, expect, it } from "vitest";

describe("KeywordPendingEmptyState", () => {
  it.each([
    ["never_checked", "First check has not run yet.", "No ranking data yet", "Run first check"],
    [
      "failed",
      "The last check returned an error.",
      "No position from the latest check",
      "Retry check",
    ],
    [
      "running",
      "The provider is fetching results for this keyword. The page updates as soon as the check completes.",
      "Rank check in progress",
      "Refresh",
    ],
  ] as const)("keeps the %s copy and action exact", (state, body, title, link) => {
    const copy = emptyRankCopy(state, "prj_1", 20, true);

    expect(copy).toMatchObject({ body, link, title });
  });

  it("owns the not_ranked depth label as a builder resolved against the run depth", () => {
    const copy = emptyRankCopy("not_ranked", "prj_1", 20, true);

    expect(copy.body).toBe("Outside the tracked depth on the last check.");
    expect(copy.title).toBe("Not ranked in the top 20");
    expect(copy.link).toBe(checkTopDepthLabel);
    expect((copy.link as (depth: 20 | 50 | 100) => string)(100)).toBe("Check top 100");
    expect((copy.link as (depth: 20 | 50 | 100) => string)(50)).toBe("Check top 50");
    expect((copy.link as (depth: 20 | 50 | 100) => string)(20)).toBe("Check top 20");
  });
});
