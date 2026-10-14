import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import { rankTrackerReportFacets } from "./rank-tracker-report-facets";
import { rankTrackerQualityRowMatches } from "./rank-tracker-report-filter";
import { sortRankTrackerQualityRows } from "./rank-tracker-report-sort";
import {
  rankTrackerQualityFixture,
  reportCheck,
  reportPolicy,
  reportTarget,
} from "./rank-tracker-report-test-fixture";

describe("whole-scope rank tracker kernel predicates", () => {
  it("does not admit a legacy unknown reported position into top-rank facets or a new-match filter", () => {
    const { row } = rankTrackerQualityFixture({
      ...reportTarget(),
      checks: [reportCheck(2, { observationRun: null })],
    });
    expect(row.rankQuality.current).toMatchObject({ evidence: "unknown", position: null });
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, position: ["top10" as const] },
    };
    expect(rankTrackerQualityRowMatches(row, query)).toBe(false);
    expect(
      rankTrackerQualityRowMatches(row, {
        ...query,
        filters: { ...query.filters, position: [], change: "new" },
      }),
    ).toBe(false);
    expect(rankTrackerReportFacets([row]).positions.every(({ count }) => count === 0)).toBe(true);
  });
  it("sorts unknown positions last in both directions without using numeric 101 as a rank score", () => {
    const known = rankTrackerQualityFixture().row;
    const unknown = rankTrackerQualityFixture({
      ...reportTarget(),
      id: "kw_bbcdefghijklmnopqrstuvwx",
      checks: [reportCheck(1, { observationRun: null })],
    }).row;
    for (const direction of ["asc", "desc"] as const)
      expect(
        sortRankTrackerQualityRows([unknown, known], { direction, field: "position" }).map(
          ({ id }) => id,
        ),
      ).toEqual([known.id, unknown.id]);
  });
  it("keeps an unknown volume distinct from known zero under an explicit volume filter", () => {
    const unknown = rankTrackerQualityFixture().row;
    const zero = rankTrackerQualityFixture({ ...reportTarget(), volume: 0 }).row;
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, volMin: 0, volMax: 1 },
    };
    expect(rankTrackerQualityRowMatches(unknown, query)).toBe(false);
    expect(rankTrackerQualityRowMatches(zero, query)).toBe(true);
  });
  it("compares historical expected URL rather than a subsequently edited target", () => {
    const { row } = rankTrackerQualityFixture({
      ...reportTarget(),
      checks: [reportCheck(2, { expectedUrlAtCheck: "https://example.test/historical" })],
    });
    expect(row.targetUrl).toBe("https://example.test/current-editable");
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
    };
    expect(rankTrackerQualityRowMatches(row, query)).toBe(false);
    expect(
      rankTrackerQualityRowMatches(
        { ...row, expectedUrl: "https://example.test/other-historical-target" },
        query,
      ),
    ).toBe(true);
  });
  it("does not silently choose a previous-check comparison when baseline policy is disabled", () => {
    const { row } = rankTrackerQualityFixture(reportTarget(), {
      ...reportPolicy(),
      baseline: { mode: "none" },
    });
    expect(row.rankQuality.comparison).toBe("not_requested");
    expect(
      rankTrackerQualityRowMatches(row, {
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, change: "new" },
      }),
    ).toBe(false);
  });
  it("keeps current-revision KPI unknown while retaining separately qualified historical data", () => {
    const { row } = rankTrackerQualityFixture({ ...reportTarget(), expectedScope: null });
    expect(row.rankQuality).toMatchObject({
      current: { evidence: "unknown", position: null, reason: "current_scope_unavailable" },
      currentScopeState: "unavailable",
      lastKnown: { current: { evidence: "positive", position: 2 } },
    });
    expect(rankTrackerQualityRowMatches(row, defaultRankTrackerQueryState)).toBe(true);
    expect(
      rankTrackerQualityRowMatches(row, {
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, position: ["top10"] },
      }),
    ).toBe(false);
  });
  it("does not erase an earlier retained success when the latest recorded observation lacks scope proof", () => {
    const earlier = reportCheck(3, { id: "check_bbcdefghijklmnopqrstuvwx" });
    const latest = reportCheck(2, {
      createdAt: new Date("2026-10-12T11:00:00Z"),
      observationRun: null,
    });
    const { row } = rankTrackerQualityFixture({
      ...reportTarget(),
      expectedScope: null,
      checks: [latest, earlier],
    });
    expect(row.rankQuality.lastKnown.lastSuccess).toMatchObject({ id: earlier.id, position: 3 });
    expect(row.rankQuality.lastKnownScopes).toMatchObject({
      effectiveScope: { device: "mobile", location: "Krakow" },
    });
    expect(row.sparkline).toEqual([3]);
  });
});
