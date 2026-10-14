import { describe, expect, it } from "vitest";
import { snapshotRankReportPolicy } from "./policy";
import { reportCheck, reportPolicy, reportProject, reportTarget } from "./report-test-fixture";
import { selectResolvedRankReportTargets } from "./selection";
import { resolveRankReportTargets } from "./summary";

describe("explicit report policy snapshot", () => {
  it("does not change its dates/curve when a shared registry object is subsequently mutated", () => {
    const original = reportPolicy();
    const before = snapshotRankReportPolicy(original);
    const snapshot = snapshotRankReportPolicy(original);
    original.asOf.setUTCFullYear(2030);
    original.metric = { ...original.metric, curve: [1] };
    expect(snapshot).toEqual(before);
  });
  it("does not filter by an implicit previous-check baseline when comparison is disabled", () => {
    const older = reportCheck(8, {
      id: "check_bbcdefghijklmnopqrstuvwx",
      observationRun: {
        ...reportCheck(8).observationRun!,
        createdAt: new Date("2026-10-11T10:01:00Z"),
        requestPolicy: {
          evidence: {
            completeThrough: { organic_result: 100 },
            observedAt: "2026-10-11T10:00:00Z",
            policyRevision: "policy-v1",
            targetRevision: "target-v1",
            version: 1,
          },
        },
      },
    });
    const targets = resolveRankReportTargets(
      [{ ...reportTarget(), checks: [reportCheck(2), older] }],
      { ...reportPolicy(), baseline: { mode: "none" } },
      reportProject.id,
    );
    expect(
      selectResolvedRankReportTargets(targets, {
        evidence: "any",
        events: [],
        execution: "any",
        freshness: "any",
        movement: "up",
        position: null,
      }),
    ).toEqual([]);
  });
});
