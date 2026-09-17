import { emptyRankCopy } from "@/components/keywords/KeywordPendingEmptyState";
import { describe, expect, it } from "vitest";

describe("KeywordPendingEmptyState", () => {
  it.each([
    ["never_checked", "run_first_check"],
    ["failed", "retry"],
    ["running", "refresh"],
  ] as const)("keeps the %s semantic state and action", (state, action) => {
    const copy = emptyRankCopy(state, "prj_1", 20, true);

    expect(copy).toMatchObject({ action, depth: 20 });
  });

  it("keeps the raw not-ranked depth for the rendering boundary", () => {
    const copy = emptyRankCopy("not_ranked", "prj_1", 20, true);

    expect(copy).toMatchObject({ action: "check_top", depth: 20 });
  });
});
