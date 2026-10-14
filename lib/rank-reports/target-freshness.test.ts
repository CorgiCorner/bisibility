import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { describe, expect, it } from "vitest";
import { rankReportRecords } from "./records";
import { reportPolicy, reportProject, reportTarget } from "./report-test-fixture";
import { resolveRankReportTargets, summarizeRankReport } from "./summary";

describe("captured target freshness policy", () => {
  it("keeps two-hour-old hourly and daily measurements in different freshness states", () => {
    const policy = reportPolicy();
    const targets = [
      { ...reportTarget(), freshForMs: 60 * 60 * 1000 },
      { ...reportTarget(), id: "kw_bbcdefghijklmnopqrstuvwx", freshForMs: 24 * 60 * 60 * 1000 },
    ];
    const resolved = resolveRankReportTargets(targets, policy, reportProject.id);
    expect(resolved.map(({ resolution }) => resolution.current?.freshness)).toEqual([
      "stale",
      "fresh",
    ]);
    expect(summarizeRankReport(resolved, policy).metric).toMatchObject({
      counts: { expected: 2, freshDeterminate: 1, stale: 1, unknownFreshness: 0 },
      dataCoverage: 0.5,
    });
    expect(
      rankReportRecords(targets, policy, reportProject.id).map(
        ({ observation }) => observation?.freshness,
      ),
    ).toEqual(["stale", "fresh"]);
  });
  it("does not inherit shared cadence when the host explicitly cannot prove manual TTL", () => {
    const policy = { ...reportPolicy(), freshForMs: 24 * 60 * 60 * 1000 };
    const target = { ...reportTarget(), freshForMs: null };
    const resolved = resolveRankReportTargets([target], policy, reportProject.id);
    expect(resolved[0].resolution.current).toMatchObject({
      freshness: "unknown",
      freshnessReason: "policy_unavailable",
    });
    expect(summarizeRankReport(resolved, policy).metric).toMatchObject({
      dataCoverage: null,
      counts: { freshDeterminate: null, unknownFreshness: 1 },
      freshness: "unknown",
    });
    expect(rankReportRecords([target], policy, reportProject.id)[0].observation).toMatchObject({
      freshness: "unknown",
      freshnessReason: "policy_unavailable",
    });
  });
  it("uses an explicitly shared host policy only when no target policy is supplied", () => {
    const policy = { ...reportPolicy(), freshForMs: 24 * 60 * 60 * 1000 };
    const resolved = resolveRankReportTargets([reportTarget()], policy, reportProject.id);
    expect(resolved[0].resolution.current?.freshness).toBe("fresh");
    expect(summarizeRankReport(resolved, policy).metric.dataCoverage).toBe(1);
  });
  it("preserves the per-target policy in current-definition list resolution and retained history", () => {
    const policy = { ...reportPolicy(), freshForMs: 24 * 60 * 60 * 1000 };
    const target = reportTarget();
    const expectedScope = recordedMeasurement(
      target.checks[0],
      target.id,
      reportProject.id,
    ).effectiveScope;
    const resolved = resolveCurrentRankTrackerTargets(
      [{ ...target, expectedScope, freshForMs: null }],
      policy,
      reportProject.id,
    )[0];
    expect(resolved.currentScopeState).toBe("verified");
    expect(resolved.resolution.current?.freshness).toBe("unknown");
    expect(resolved.historicalResolution.resolution.current?.freshness).toBe("unknown");
  });
});
