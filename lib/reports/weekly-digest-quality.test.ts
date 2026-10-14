import { describe, expect, it } from "vitest";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
import type { RankReportTarget, RetainedReportCheck } from "@/lib/rank-reports/model";
import { weeklyDigestQuality } from "./weekly-digest-quality";
const now = new Date("2026-10-12T12:00:00Z");
const before = new Date("2026-10-05T12:00:00Z");
const scope = { ...fixtureScope, projectId: "project-a", targetId: "target-a" };
function check(id: string, at: Date, position: number): RetainedReportCheck {
  const record = recordedFixture(position, { id, observedAt: at, recordedAt: at, configuredScope: scope, effectiveScope: scope });
  return { ...record, createdAt: at, updatedAt: at, attemptCount: 1, deferredReason: null, errorCode: null,
    expectedUrlAtCheck: null, finishedAt: at, startedAt: at, observationRun: { ...record.observationRun, items: [] } };
}
function target(): RankReportTarget { return { id: "target-a", volume: 1, expectedScope: scope,
  freshForMs: 86_400_000, baselineWindow: { before, notBefore: new Date(before.getTime() - 86_400_000) },
  checks: [check("new", new Date("2026-10-12T11:00:00Z"), 3), check("old", new Date("2026-10-05T11:00:00Z"), 8)] }; }
const policy = { ...hostOrganicReportPolicy(now), currentNotBefore: before };
const evaluate = (rows: RankReportTarget[]) => weeklyDigestQuality(rows, policy, "project-a", new Map([["target-a", "keyword"]]));
describe("weekly digest uses current authority and shared comparison", () => {
  it("compares compatible captured history with explicit target tolerance", () => {
    const result = evaluate([target()]); expect(result.avgPositionDelta).toBe(5);
    expect(result.report.metric.counts).toMatchObject({ expected: 1, comparable: 1 });
  });
  it("does not substitute mutable settings, missing heads, or A-B-A scope for current proof", () => {
    for (const expectedScope of [null, { ...scope, targetRevision: "epoch-after-return" }]) {
      const result = evaluate([{ ...target(), expectedScope }]);
      expect(result.movers).toEqual([]); expect(result.report.metric.counts.unknown).toBe(1);
    }
  });
  it("keeps unknown freshness and unavailable baseline explicit", () => {
    const result = evaluate([{ ...target(), freshForMs: null, baselineWindow: null }]);
    expect(result.avgPositionDelta).toBeNull(); expect(result.report.metric.dataCoverage).toBeNull();
  });
  it("rejects stale current and too-old baseline rather than selecting last completed", () => {
    const stale = { ...target(), freshForMs: 1 };
    expect(evaluate([stale]).avgPositionDelta).toBeNull();
    const old = target(); old.checks = [old.checks[0], check("ancient", new Date("2026-09-01T00:00:00Z"), 80)];
    expect(evaluate([old]).movers).toEqual([]);
  });
  it("includes never checked targets in the denominator and does not create rank101", () => {
    const result = evaluate([target(), { id: "never", checks: [], expectedScope: null, volume: null, freshForMs: null, baselineWindow: null }]);
    expect(result.report.metric.counts).toMatchObject({ expected: 2, neverChecked: 1, comparable: 1 });
    expect(result.movers.map((row) => row.delta)).toEqual([5]);
  });
});
