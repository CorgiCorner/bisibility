import { describe, expect, it } from "vitest";
import type { RetainedReportCheck } from "./model";
import { reportCheck, reportPolicy, reportProject, reportTarget } from "./report-test-fixture";
import { rankReportTargetResolution } from "./resolution";
import { resolveRankReportTargets, summarizeRankReport } from "./summary";

function baselineCheck(position: number | null, normalizationVersion = "v1"): RetainedReportCheck {
  const check = reportCheck(position);
  if (!check.observationRun) throw new Error("Missing captured observation fixture");
  const recordedAt = new Date("2026-09-30T10:01:00Z");
  return {
    ...check,
    checkedAt: recordedAt,
    createdAt: recordedAt,
    id: "check_bbcdefghijklmnopqrstuvwx",
    normalizationVersion,
    updatedAt: recordedAt,
    observationRun: {
      ...check.observationRun,
      createdAt: recordedAt,
      executedAt: recordedAt,
      requestPolicy: {
        evidence: {
          completeThrough: { organic_result: 100 },
          observedAt: "2026-09-30T10:00:00Z",
          policyRevision: "policy-v1",
          targetRevision: "target-v1",
          version: 1,
        },
      },
    },
    rankingUrl: "https://example.test/baseline",
  };
}

describe("report projections retain shared-kernel comparisons", () => {
  it("uses the explicit September baseline and URLs rather than the latest same-day check", () => {
    const policy = reportPolicy();
    const resolved = resolveRankReportTargets(
      [{ ...reportTarget(), checks: [reportCheck(2), baselineCheck(3)] }],
      policy,
      reportProject.id,
    )[0];
    expect(rankReportTargetResolution(resolved, policy)).toMatchObject({
      baseline: { position: 3, rankingUrl: "https://example.test/baseline" },
      comparison: "comparable",
      current: { position: 2, rankingUrl: "https://example.test/historical" },
      event: "moved",
      movement: 1,
    });
    expect(summarizeRankReport([resolved], policy).metric).toMatchObject({
      counts: { comparable: 1 },
      delta: 40,
    });
  });

  it("retains a scope/definition boundary as unavailable rather than zero movement", () => {
    const policy = reportPolicy();
    const resolved = resolveRankReportTargets(
      [{ ...reportTarget(), checks: [reportCheck(2), baselineCheck(3, "v0")] }],
      policy,
      reportProject.id,
    )[0];
    expect(rankReportTargetResolution(resolved, policy)).toMatchObject({
      baseline: null,
      comparison: "unavailable",
      comparisonBoundary: {
        point: { normalizationVersion: "v0" },
        reason: "incompatible_or_unproven",
      },
      movement: null,
    });
    expect(summarizeRankReport([resolved], policy).metric.delta).toBeNull();
  });

  it("keeps a qualified entry comparable but without a fabricated numeric rank difference", () => {
    const policy = reportPolicy();
    const resolved = resolveRankReportTargets(
      [{ ...reportTarget(), checks: [reportCheck(2), baselineCheck(null)] }],
      policy,
      reportProject.id,
    )[0];
    expect(rankReportTargetResolution(resolved, policy)).toMatchObject({
      baseline: { evidence: "known_absent", position: null },
      comparison: "comparable",
      event: "entered",
      movement: null,
    });
    expect(summarizeRankReport([resolved], policy).metric).toMatchObject({
      counts: { comparable: 1 },
      delta: 50,
    });
  });
});
