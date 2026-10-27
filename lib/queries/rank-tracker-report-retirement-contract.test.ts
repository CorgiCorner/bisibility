import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { RANK_TRACKER_SORT_FIELDS } from "@/lib/keywords/rank-tracker-query-types";
import { describe, expect, it } from "vitest";
import { rankTrackerReportLocations } from "./rank-tracker-report-facets";
import { groupRankTrackerReportRows } from "./rank-tracker-report-grouped";
import {
  rankTrackerQualityFixture,
  reportPolicy,
  reportTarget,
} from "./rank-tracker-report-test-fixture";

function cohort() {
  return [" Alpha ", "alpha", "Beta", "beta"].map((keyword, index) => {
    const value = rankTrackerQualityFixture({
      ...reportTarget(),
      id: `kw_${String(index).padStart(24, "a")}`,
      volume: index < 2 ? 0 : 10,
    });
    return { ...value, row: { ...value.row, keyword } };
  });
}

describe("active report contracts retained when the legacy grouped SQL is removed", () => {
  it("normalizes terms before grouping without losing any authorized target", () => {
    const selected = cohort();
    const groups = groupRankTrackerReportRows(
      selected.map(({ row }) => row),
      selected.map(({ resolution }) => resolution),
      reportPolicy(),
      { ...defaultRankTrackerQueryState, grouped: true },
    );
    expect(groups.map(({ scopeTerm }) => scopeTerm)).toEqual(["alpha", "beta"]);
    expect(groups.map(({ subRows }) => subRows.length)).toEqual([2, 2]);
    expect(groups.flatMap(({ subRows }) => subRows.map(({ id }) => id)).sort()).toEqual(
      selected.map(({ row }) => row.id).sort(),
    );
    expect(
      groups.map(({ marketGrid }) => marketGrid?.kind === "parent" && marketGrid.aggregate.volume),
    ).toEqual([0, 10]);
  });

  it.each(RANK_TRACKER_SORT_FIELDS)(
    "preserves the cohort and deterministic ties for %s in both directions",
    (field) => {
      const selected = cohort();
      const rows = selected.map(({ row }) => row);
      const resolutions = selected.map(({ resolution }) => resolution);
      for (const direction of ["asc", "desc"] as const) {
        const query = {
          ...defaultRankTrackerQueryState,
          grouped: true,
          sort: { field, direction },
        };
        const groups = groupRankTrackerReportRows(rows, resolutions, reportPolicy(), query);
        const reversed = groupRankTrackerReportRows(
          [...rows].reverse(),
          resolutions,
          reportPolicy(),
          query,
        );
        expect(reversed.map(({ scopeTerm }) => scopeTerm)).toEqual(
          groups.map(({ scopeTerm }) => scopeTerm),
        );
        expect(groups.flatMap(({ subRows }) => subRows.map(({ id }) => id)).sort()).toEqual(
          rows.map(({ id }) => id).sort(),
        );
      }
    },
  );

  it("retains empty registered markets and equal-count language labels using opaque scope keys", () => {
    const selected = cohort();
    const base = selected[0].row.location;
    const locations = [
      {
        ...base,
        canonicalKey: "opaque-a",
        displayName: "Spain",
        languageLabel: "English",
        kind: "country" as const,
      },
      {
        ...base,
        canonicalKey: "opaque-b",
        displayName: "Spain",
        languageLabel: "Spanish",
        kind: "country" as const,
      },
      {
        ...base,
        canonicalKey: "opaque-c",
        displayName: "Spain",
        languageLabel: "French",
        kind: "country" as const,
      },
    ];
    const rows = selected
      .slice(0, 2)
      .map(({ row }, index) => ({ ...row, location: locations[index] }));
    expect(rankTrackerReportLocations(rows, locations)).toEqual([
      { count: 1, displayName: "Spain / English", id: "opaque-a", kind: "country" },
      { count: 1, displayName: "Spain / Spanish", id: "opaque-b", kind: "country" },
      { count: 0, displayName: "Spain / French", id: "opaque-c", kind: "country" },
    ]);
  });

  it("refuses a grouped target without its authorized resolution rather than omitting it", () => {
    const selected = cohort();
    expect(() =>
      groupRankTrackerReportRows(
        selected.map(({ row }) => row),
        [],
        reportPolicy(),
        { ...defaultRankTrackerQueryState, grouped: true },
      ),
    ).toThrow("authorized resolution");
  });
});
