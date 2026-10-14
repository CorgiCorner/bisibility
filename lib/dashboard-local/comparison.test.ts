import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { filterRankTrackerLocalRows } from "@/lib/queries/rank-tracker-local-projection";
import { localListFixture } from "@/lib/queries/rank-tracker-local-test-fixture";
import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
import { describe, expect, it } from "vitest";
import { aggregateLocalRows } from "./aggregate";
import { projectLocalRows } from "./projection";
import {
  expectedLocalScope,
  localCheck,
  localDecision,
  localFixtureAsOf,
  localFixtureScope,
} from "./test-fixtures";

function recorded(day: number, position: number | null) {
  const check = localCheck(`target-1-${day}`, position, position === null ? { absent: true } : {});
  check.keywordId = "target-1";
  const at = new Date(localFixtureAsOf.getTime() - day * 86_400_000 - 3_600_000);
  check.checkedAt = check.createdAt = check.updatedAt = at;
  const run = check.observationRun;
  if (!run) throw new Error("Expected normalized observation");
  run.createdAt = run.executedAt = at;
  run.requestPolicy = {
    evidence: {
      version: 1,
      adapterVersion: "adapter-1",
      targetRevision: "target-1",
      policyRevision: "policy-1",
      observedAt: at.toISOString(),
      requestedAt: at.toISOString(),
      completeThrough: { local_pack: 3 },
    },
  };
  for (const item of run.items) item.createdAt = item.observedAt = at;
  return check;
}

describe("Local canonical period uses the shared measurement resolver", () => {
  const checks = [recorded(0, 1), recorded(7, 2), recorded(28, 3), recorded(90, null)];
  const decisions = new Map(
    checks.flatMap((check) => {
      if (!check.observationRun?.items.length) return [];
      const decision = localDecision(check);
      decision.recordedAt = new Date(check.createdAt.getTime() + 1);
      return [[decision.itemId, decision] as const];
    }),
  );
  const targets = [{ id: "target-1", publicId: "target-1", text: "Service" }];

  it.each([
    [7, 2, 1, "moved"],
    [28, 3, 2, "moved"],
    [90, null, null, "re_entered"],
  ] as const)(
    "%s days select a different retained baseline without inventing a 101 rank",
    (days, baseline, movement, event) => {
      const policy = hostOrganicReportPolicy(localFixtureAsOf, days);
      if (policy.baseline.mode !== "before") throw new Error("Expected explicit baseline");
      const window = {
        before: policy.baseline.before,
        notBefore: new Date(policy.baseline.before.getTime() - 7_200_000),
      };
      const metadata = new Map([
        [
          "target-1",
          {
            expectedScope: expectedLocalScope("target-1"),
            freshForMs: 7_200_000,
            baselineWindow: window,
          },
        ],
      ]);
      const rows = projectLocalRows(targets, checks, decisions, metadata, {
        ...localFixtureScope,
        policy,
      });
      expect(rows[0].target.current?.position).toBe(1);
      expect(rows[0].target.baseline?.position).toBe(baseline);
      expect(rows[0].target.movement).toBe(movement);
      expect(rows[0].target.event).toBe(event);
      const template = localListFixture(2);
      const report = {
        ...template.report,
        rows,
        expected: 1,
        retainedChecks: 4,
        ...aggregateLocalRows(rows, localFixtureAsOf),
      };
      const projected = filterRankTrackerLocalRows(
        template.organic,
        report,
        structuredClone(defaultRankTrackerQueryState),
        policy,
      );
      expect(projected.facts[0]?.target?.position).toBe(1);
      expect(projected.filtered.targetTop3.counts.comparable).toBe(1);
      expect(projected.filtered.targetTop3.compositionReason).toBe(
        "baseline_membership_unavailable",
      );
      expect(projected.filtered.retainedChecks).toBe(4);
      const up = filterRankTrackerLocalRows(
        template.organic,
        report,
        {
          ...defaultRankTrackerQueryState,
          filters: { ...defaultRankTrackerQueryState.filters, change: "up" },
        },
        policy,
      );
      expect(up.filtered.expected).toBe(days === 90 ? 0 : 1);
    },
  );
  it("unknown comparison tolerance does not choose arbitrary older history", () => {
    const policy = hostOrganicReportPolicy(localFixtureAsOf, 28);
    const rows = projectLocalRows(
      targets,
      checks,
      decisions,
      new Map([
        [
          "target-1",
          {
            expectedScope: expectedLocalScope("target-1"),
            freshForMs: 7_200_000,
            baselineWindow: null,
          },
        ],
      ]),
      { ...localFixtureScope, policy },
    );
    expect(rows[0].target.baseline).toBeNull();
    expect(rows[0].target.movement).toBeNull();
    expect(aggregateLocalRows(rows, localFixtureAsOf).targetTop3.counts.comparable).toBe(0);
  });
});
