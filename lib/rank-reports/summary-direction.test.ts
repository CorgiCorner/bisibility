import { describe, expect, it } from "vitest";
import { reportCheck, reportPolicy, reportProject, reportTarget } from "./report-test-fixture";
import { resolveRankReportTargets, summarizeRankReport } from "./summary";

function target(id: string, current: number | null, previous: number | null) {
  const baseline = reportCheck(previous);
  const at = new Date("2026-09-25T10:00:00Z");
  baseline.createdAt = at;
  baseline.checkedAt = at;
  baseline.observationRun = baseline.observationRun && {
    ...baseline.observationRun,
    createdAt: at,
    requestPolicy: {
      evidence: {
        version: 1,
        completeThrough: { organic_result: 100 },
        observedAt: at.toISOString(),
        targetRevision: "target-v1",
        policyRevision: "policy-v1",
      },
    },
  };
  return { ...reportTarget(), id, checks: [reportCheck(current), baseline] };
}

describe("whole selection movement directions", () => {
  it("counts signs from the shared comparable resolver, keeping entrances, exits and unknown separate", () => {
    const policy = { ...reportPolicy(), horizon: 20, minimumRequestedDepth: 20 };
    const targets = [
      target("up", 6, 9),
      target("down", 9, 6),
      target("same", 6, 6),
      target("entered", 6, null),
      target("exited", null, 6),
      { ...target("unknown", 6, 9), checks: [reportCheck(6, { observationRun: null })] },
    ];
    const resolved = resolveRankReportTargets(targets, policy, reportProject.id);
    expect(resolved.map(({ resolution }) => resolution.movement)).toEqual([
      3,
      -3,
      0,
      null,
      null,
      null,
    ]);
    expect(summarizeRankReport(resolved, policy).movementCounts).toMatchObject({
      improved: 1,
      declined: 1,
      moved: 2,
      steady: 1,
      entered: 1,
      exited: 1,
      unknown: 1,
    });
    expect(
      summarizeRankReport(resolved, { ...policy, baseline: { mode: "none" } }).movementCounts,
    ).toBeNull();
  });
});
