import { keywordExportSelectionSchema } from "@/lib/keywords/keyword-export-contract";
import { parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import { rankTrackerScope } from "@/lib/keywords/rank-tracker-report-scope";
import { reportAsOf, reportKeyword } from "@/lib/rank-reports/report-test-fixture";
import { describe, expect, it } from "vitest";
import { keywordExportTarget } from "./export-target-model";

describe("General export time targeting", () => {
  it("actual export targeting keeps period/asOf for unfiltered and selected General targets", () => {
    const query = parseRankTrackerQuery({
      comparisonDays: "28",
      asOf: reportAsOf.toISOString(),
    }).state;
    const input = {
      filterChips: [],
      filteredRows: [],
      rows: [],
      flatServerQuery: query,
      searchValue: "",
      selectedIds: [],
      matchedTargetCount: 60,
    };
    const all = keywordExportTarget(input);
    expect(all).toEqual({
      count: 60,
      selection: { mode: "query", query: { ...query, grouped: false } },
    });
    const selected = keywordExportTarget({ ...input, selectedIds: [reportKeyword] });
    expect(keywordExportSelectionSchema.parse(selected.selection)).toEqual({
      mode: "selected",
      keywordIds: [reportKeyword],
      reportScope: query.reportScope,
    });
    expect(
      keywordExportSelectionSchema.safeParse({
        ...selected.selection,
        reportScope: { ...rankTrackerScope(query), view: "local" },
      }).success,
    ).toBe(false);
  });
});
