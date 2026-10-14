import { fixtureAsOf } from "@/lib/rank-measurements/fixtures";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { describe, expect, it } from "vitest";
import { snapshotFor } from "./overview-builders";
import { buildOverviewMarkets } from "./overview-markets";
import { buildOverviewMetrics } from "./overview-metrics";
import { buildTrend } from "./overview-trend";

function keyword(id: string, rankChecks = [recordedFixture(1)]) {
  return {
    id,
    projectId: "project-a",
    publicId: id,
    text: `Synthetic ${id}`,
    createdAt: new Date("2026-01-01"),
    _count: { rankChecks: rankChecks.length },
    device: "desktop",
    schedule: null,
    locationId: "city-a",
    locationRef: { displayName: "City A", languageCode: "en", languageLabel: "English" },
    rankChecks,
  };
}
describe("overview consumers use the same quality oracle", () => {
  function capturedKeyword() {
    const row = keyword("a");
    const scope = recordedMeasurement(
      row.rankChecks[0],
      row.publicId,
      row.projectId,
    ).effectiveScope;
    return {
      ...row,
      measurementPolicy: {
        asOf: fixtureAsOf,
        expectedScope: scope,
        freshForMs: null as number | null,
        baselineEnabled: false,
        requireCurrentScope: true,
      },
    };
  }
  it("passes a real captured unknown tolerance through headline and Visibility without inventing a delta", () => {
    const row = capturedKeyword();
    const snapshot = snapshotFor(row, 1, fixtureAsOf);
    const metrics = buildOverviewMetrics([snapshot], { asOf: fixtureAsOf });
    expect(snapshot.quality.baseline).toBeNull();
    expect(metrics).toMatchObject({
      visibility: 100,
      visibilityDelta: null,
      qualityReport: { dataCoverage: null, freshness: "unknown" },
    });
  });
  it("excludes a stale positive target using its actual captured TTL rather than a shared default", () => {
    const row = capturedKeyword();
    row.measurementPolicy.freshForMs = 0;
    const metrics = buildOverviewMetrics([snapshotFor(row, 1, fixtureAsOf)], { asOf: fixtureAsOf });
    expect(metrics.averagePosition).toBeNull();
    expect(metrics.qualityReport.counts.stale).toBe(1);
  });
  it("does not promote a retained rank into a current KPI when the current definition is unavailable", () => {
    const row = capturedKeyword();
    row.measurementPolicy.expectedScope = null;
    const snapshot = snapshotFor(row, 1, fixtureAsOf);
    expect(snapshot.quality.current).toMatchObject({
      evidence: "unknown",
      reason: "current_scope_unavailable",
    });
    expect(buildOverviewMetrics([snapshot], { asOf: fixtureAsOf }).visibility).toBeNull();
  });
  it("preserves an actual zero volume instead of imputing a positive weight", () => {
    const metrics = buildOverviewMetrics([snapshotFor(capturedKeyword(), 0, fixtureAsOf)], {
      asOf: fixtureAsOf,
    });
    expect(metrics.visibility).toBeNull();
  });
  it("excludes unproved null from Visibility and keeps the honest measured population", () => {
    const rows = [keyword("a"), keyword("b", [recordedFixture(null, { completeThrough: null })])];
    const result = buildOverviewMetrics(
      rows.map((row) => snapshotFor(row, 1, fixtureAsOf)),
      { asOf: fixtureAsOf },
    );
    expect(result.visibility).toBe(100);
    expect(result.visibilityMeasuredKeywordCount).toBe(1);
    expect(result.qualityReport.observedCoverage).toBe(0.5);
    expect(result.qualityReport.dataCoverage).toBeNull();
    expect(result.qualityReport.counts.freshDeterminate).toBeNull();
  });
  it("market missing prior evidence is null rather than a +100 comparison", () => {
    const result = buildOverviewMarkets([keyword("a")], { now: fixtureAsOf, range: "7d" });
    expect(result[0]).toMatchObject({ top10Share: 100, deltaPoints: null, targetCount: 1 });
  });
  it("retains a resolved rank after a failed latest attempt in both headline and attention", () => {
    const earlier = recordedFixture(3, {
      id: "success",
      recordedAt: new Date("2026-10-01T10:00:00Z"),
    });
    const failed = recordedFixture(null, {
      id: "failure",
      execution: "failed",
      recordedAt: new Date("2026-10-02T10:00:00Z"),
    });
    const row = snapshotFor(keyword("a", [failed, earlier]), 1, fixtureAsOf);
    const metrics = buildOverviewMetrics([row], { asOf: fixtureAsOf });
    expect(metrics.averagePosition).toBe(3);
    expect(metrics.top3Count).toBe(1);
    expect(metrics.qualityReport.counts.failed).toBe(1);
  });
  it("does not place a captured country result into the current city report", () => {
    const row = keyword("a");
    row.rankChecks[0].observationRun.configuredScope = {
      ...row.rankChecks[0].observationRun.configuredScope!,
      location: "Country A",
    };
    row.rankChecks[0].observationRun.effectiveScope =
      row.rankChecks[0].observationRun.configuredScope;
    expect(buildOverviewMarkets([row], { now: fixtureAsOf, range: "7d" })[0].top10Share).toBeNull();
  });
  it("retains measured targets while execution is paused", () => {
    const paused = { ...keyword("b"), schedule: { frequency: "paused" } };
    expect(
      buildOverviewMarkets([keyword("a"), paused], { now: fixtureAsOf, range: "7d" })[0]
        .targetCount,
    ).toBe(2);
    expect(paused.schedule.frequency).toBe("paused");
  });
  it("keeps all thirty-one history days and the last actual date", () => {
    const checks = Array.from({ length: 31 }, (_, index) => {
      const at = new Date(Date.UTC(2026, 8, index + 1, 10));
      return recordedFixture(5, { id: `check-${index}`, observedAt: at, recordedAt: at });
    });
    const trend = buildTrend([keyword("a", checks)]);
    expect(trend).toHaveLength(31);
    expect(trend.at(-1)?.label).toBe("2026-10-01");
    expect(trend.every((point) => point.value === 5)).toBe(true);
  });
});
