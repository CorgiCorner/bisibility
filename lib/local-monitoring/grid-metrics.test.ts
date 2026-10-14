import { aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import { resolveMeasurements } from "@/lib/rank-measurements/resolve";
import { describe, expect, it } from "vitest";
import {
  aggregateGridMeasurements,
  GRID_TOP_N_DEFINITION,
  projectGridReport,
} from "./grid-metrics";
import { gridMeasurementFixture } from "./measurement.test-fixture";

describe("sampled grid projection of the shared quality oracle", () => {
  it("keeps E25 T10 U5 equal to 50 percent observed, 80 coverage and 40..60 bounds", () => {
    const fixture = gridMeasurementFixture();
    const original = structuredClone(fixture.targets);
    const result = aggregateGridMeasurements(fixture.selection, fixture.targets, fixture.policy);
    expect(result).toMatchObject({
      expectedPoints: 25,
      eligibleTopNCount: 10,
      freshTopNCount: 10,
      observedDeterminateCount: 20,
      eligibleDeterminateCount: 20,
      provenFreshDeterminateCount: 20,
      unresolvedExpected: 5,
      observedRate: 0.5,
      observedCoverage: 0.8,
      dataCoverage: 0.8,
      sampleBounds: [0.4, 0.6],
      scope: "sampled_points",
    });
    expect(fixture.targets).toEqual(original);
  });
  it("labels unknown freshness without inventing TTL or numeric fresh count", () => {
    const fixture = gridMeasurementFixture(false);
    expect(
      aggregateGridMeasurements(fixture.selection, fixture.targets, fixture.policy),
    ).toMatchObject({
      observedRate: 0.5,
      observedCoverage: 0.8,
      dataCoverage: null,
      provenFreshDeterminateCount: null,
      freshTopNCount: null,
      unresolvedExpected: null,
      sampleBounds: null,
      report: { freshnessReason: "policy_unavailable" },
    });
  });
  it("keeps retained fresh success independent of the latest failed attempt", () => {
    const fixture = gridMeasurementFixture();
    const current = fixture.targets[0].current!;
    fixture.targets[0] = {
      ...fixture.targets[0],
      latestAttempt: {
        ...current.measurement,
        id: "synthetic-later-failure",
        execution: "failed",
        position: null,
      },
    };
    expect(
      aggregateGridMeasurements(fixture.selection, fixture.targets, fixture.policy),
    ).toMatchObject({
      observedDeterminateCount: 20,
      eligibleDeterminateCount: 20,
      dataCoverage: 0.8,
      observedRate: 0.5,
      report: { counts: { failed: 1, measured: 20 } },
    });
  });
  it("refuses incomplete populations, nonbinary curves and false full-coverage metadata", () => {
    const fixture = gridMeasurementFixture();
    expect(() =>
      aggregateGridMeasurements(fixture.selection, fixture.targets.slice(1), fixture.policy),
    ).toThrow();
    expect(() =>
      aggregateGridMeasurements(fixture.selection, fixture.targets, {
        ...fixture.policy,
        curve: [1, 0.5],
      }),
    ).toThrow();
    const result = aggregateGridMeasurements(fixture.selection, fixture.targets, fixture.policy);
    expect(() => projectGridReport({ ...result.report, isTruncated: true })).toThrow();
    expect(() => projectGridReport({ ...result.report, dataCoverage: 1 })).toThrow();
    expect(() =>
      projectGridReport({
        ...result.report,
        contributions: result.report.contributions.map((row) => ({ ...row, weight: 2 })),
      }),
    ).toThrow();
  });
  it("preserves absence uncertainty rather than zero-imputing unknown samples", () => {
    const fixture = gridMeasurementFixture();
    expect(
      fixture.targets.slice(20).every(({ current }) => current?.reason === "unproven_absence"),
    ).toBe(true);
    const result = aggregateGridMeasurements(fixture.selection, fixture.targets, fixture.policy);
    expect(result.report.counts.knownAbsent).toBe(10);
    expect(result.report.counts.unknown).toBe(5);
    expect(result.observedRate).not.toBe(10 / 25);
  });
  it("evaluates a seven-day baseline at its own period despite a daily current freshness policy", () => {
    const fixture = gridMeasurementFixture();
    const current = fixture.targets[0].current!.measurement;
    const baseline = {
      ...current,
      id: "synthetic-seven-day-baseline",
      position: 12,
      observedAt: new Date("2026-10-05T11:30:00.000Z"),
      recordedAt: new Date("2026-10-05T11:31:00.000Z"),
    };
    const resolved = resolveMeasurements([current, baseline], {
      asOf: fixture.policy.asOf,
      horizon: 10,
      freshForMs: 24 * 60 * 60 * 1000,
      baselineBefore: new Date("2026-10-05T12:00:00.000Z"),
    });
    expect(resolved.baseline?.freshness).toBe("fresh");
    fixture.targets[0] = {
      ...fixture.targets[0],
      current: resolved.current,
      baseline: resolved.baseline,
    };
    expect(
      aggregateGridMeasurements(fixture.selection, fixture.targets, fixture.policy).report,
    ).toMatchObject({ delta: 100, counts: { comparable: 1 } });
  });
  it("leaves zero expected points and zero metric denominators null", () => {
    const fixture = gridMeasurementFixture();
    const report = aggregateMeasurements([], {
      ...fixture.policy,
      metricId: "grid_top_n",
      definitionVersion: GRID_TOP_N_DEFINITION,
      weightProvenance: { source: "sampled_points_unit_weight", period: null, market: null },
    });
    expect(projectGridReport(report)).toMatchObject({
      expectedPoints: 0,
      observedRate: null,
      observedCoverage: null,
      dataCoverage: null,
      sampleBounds: null,
    });
  });
});
