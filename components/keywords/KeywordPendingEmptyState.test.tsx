import { emptyRankCopy } from "@/components/keywords/KeywordPendingEmptyState";
import { describe, expect, it } from "vitest";

describe("KeywordPendingEmptyState", () => {
  it.each([
    ["never_checked", "First check has not run yet.", "No ranking data yet", "Run first check"],
    [
      "not_ranked",
      "Outside the tracked depth on the last check.",
      "Not ranked in the top 20",
      "Check top 100",
    ],
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
});
