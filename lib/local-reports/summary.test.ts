import { aggregateLocalRows } from "@/lib/dashboard-local/aggregate";
import type { LocalReport } from "@/lib/dashboard-local/model";
import { projectLocalRows } from "@/lib/dashboard-local/projection";
import {
  expectedLocalScope,
  localCheck,
  localDecision,
  localFixtureAsOf,
  localFixtureScope,
} from "@/lib/dashboard-local/test-fixtures";
import { describe, expect, it, vi } from "vitest";
import { localReportSummary } from "./summary";

vi.mock("server-only", () => ({}));

function report(freshForMs: number | null): LocalReport {
  const checks = [
    ...["a", "b", "c", "d", "e", "f"].map((id, index) => localCheck(id, [1, 1, 3, 3, 2, 2][index])),
    localCheck("g", null, { absent: true }),
    localCheck("h", null, { absent: true }),
    localCheck("i", null, { failed: true }),
    localCheck("j", null, { incomplete: true, absent: true }),
  ];
  const targets = checks.map(({ keywordId }) => ({
    id: keywordId,
    publicId: keywordId,
    text: keywordId,
  }));
  const decisions = new Map(
    checks.slice(0, 6).map((check, index) => {
      const decision = localDecision(check, index < 4 ? "confirmed" : "rejected");
      return [decision.itemId, decision] as const;
    }),
  );
  const metadata = new Map(
    targets.map(({ publicId }) => [
      publicId,
      { expectedScope: expectedLocalScope(publicId), freshForMs },
    ]),
  );
  const rows = projectLocalRows(targets, checks, decisions, metadata, localFixtureScope);
  return {
    asOf: localFixtureAsOf.toISOString(),
    selectionDigest: "frozen-ten-target-cohort",
    subject: {
      locationId: "original-subject",
      name: "Retained subject",
      identityRevisionId: "identity-1",
      matcherVersion: "retained-matcher",
    },
    membership: "current_active_assignment_cohort",
    comparison: "baseline_membership_unavailable",
    expected: 10,
    excluded: 3,
    retainedChecks: 18,
    rows,
    ...aggregateLocalRows(rows, localFixtureAsOf),
  };
}

describe("bounded Local report presentation", () => {
  it("keeps the complete cohort's distinct denominators and source identity without target arrays", () => {
    const source = report(7_200_000);
    const summary = localReportSummary(source);
    expect(summary).toMatchObject({
      asOf: "2026-10-12T12:00:00.000Z",
      subject: source.subject,
      expected: 10,
      retainedChecks: 18,
      presence: 75,
      targetTop3: 50,
      averageFoundSlot: 2,
      averageFoundCount: 4,
      matchCoverage: 1,
      observedCoverage: 0.8,
      counts: { expected: 10, failed: 1 },
    });
    expect(summary.conditionalTop3).toBeCloseTo((4 / 6) * 100);
    expect(summary.counts).toEqual(source.targetTop3.counts);
    expect(summary.freshness).toBe(source.targetTop3.freshness);
    expect(summary).not.toHaveProperty("rows");
    expect(summary).not.toHaveProperty("contributions");
    expect(summary).not.toHaveProperty("exclusions");
  });

  it("preserves unknown freshness and stale/null metrics instead of manufacturing a zero", () => {
    const unknown = report(null);
    expect(localReportSummary(unknown).freshness).toBe("unknown");
    const stale = report(0);
    const summary = localReportSummary(stale);
    expect(summary.targetTop3).toBeNull();
    expect(summary.presence).toBeNull();
    expect(summary.conditionalTop3).toBeNull();
    expect(summary.averageFoundSlot).toBeNull();
    expect(summary.averageFoundCount).toBe(0);
    expect(summary.matchCoverage).toBeNull();
    expect(summary.counts.stale).toBeGreaterThan(0);
    expect(summary.counts).toEqual(stale.targetTop3.counts);
    expect(summary.asOf).toBe(stale.asOf);
  });
});
