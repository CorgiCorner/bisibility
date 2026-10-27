import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import { describe, expect, it } from "vitest";
import { groupRankTrackerReportRows } from "./rank-tracker-report-grouped";
import {
  rankTrackerQualityFixture,
  reportCheck,
  reportPolicy,
  reportTarget,
} from "./rank-tracker-report-test-fixture";

describe("rank tracker grouping preserves target quality", () => {
  it("keeps the same complete target cohort and does not copy a child's quality into the parent", () => {
    const policy = reportPolicy();
    const known = rankTrackerQualityFixture();
    const unknown = rankTrackerQualityFixture({
      ...reportTarget(),
      id: "kw_bbcdefghijklmnopqrstuvwx",
      checks: [reportCheck(1, { observationRun: null })],
    });
    const rows = [known.row, { ...unknown.row, device: "Desktop" }];
    const resolutions = [known.resolution, unknown.resolution];
    const groups = groupRankTrackerReportRows(rows, resolutions, policy, {
      ...defaultRankTrackerQueryState,
      grouped: true,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      rankQuality: null,
      rankGroupReport: {
        metric: { counts: { expected: 2, ranked: 1, unknown: 1 }, freshness: "unknown" },
      },
    });
    expect(groups[0].subRows.map(({ id }) => id).sort()).toEqual(rows.map(({ id }) => id).sort());
    expect(groups[0].rankGroupReport.metric).toEqual(
      summarizeRankReport(resolutions, policy).metric,
    );
    expect(groups[0].marketGrid).toMatchObject({
      aggregate: { change: null, position: 2, sparkline: [] },
    });
  });
  it("does not copy Research metrics across different language markets", () => {
    const first = rankTrackerQualityFixture();
    const second = rankTrackerQualityFixture({
      ...reportTarget(),
      id: "kw_bbcdefghijklmnopqrstuvwx",
    });
    const research = {
      volume: 800,
      difficulty: 12,
      cpc: 1.5,
      intent: "commercial" as const,
      sourceSeed: "service",
      fetchedAt: "2026-01-02T00:00:00Z",
      trend: [],
    };
    const rows = [
      { ...first.row, research },
      { ...second.row, research, location: { ...second.row.location, hl: "en" } },
    ];
    const groups = groupRankTrackerReportRows(
      rows,
      [first.resolution, second.resolution],
      reportPolicy(),
      {
        ...defaultRankTrackerQueryState,
        grouped: true,
        sort: { field: "researchVolume", direction: "desc" },
      },
    );
    expect(groups[0].research).toBeNull();
    expect(groups[0].subRows.map((row) => row.research?.volume)).toEqual([800, 800]);
  });

  it("does not inject the old 48-hour freshness cutoff when server policy is unavailable", () => {
    const policy = reportPolicy();
    const target = rankTrackerQualityFixture();
    const group = groupRankTrackerReportRows([target.row], [target.resolution], policy, {
      ...defaultRankTrackerQueryState,
      grouped: true,
    })[0];
    expect(group.rankGroupReport.metric).toMatchObject({
      freshness: "unknown",
      freshnessReason: "policy_unavailable",
      dataCoverage: null,
    });
    expect(group.rankGroupReport.timeBasis.asOf).toBe(policy.asOf.toISOString());
  });
});
