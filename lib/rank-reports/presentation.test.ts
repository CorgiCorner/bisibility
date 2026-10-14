import { describe, expect, it } from "vitest";
import { presentReportSummary } from "./presentation";
import { reportPolicy, reportTarget } from "./report-test-fixture";
import { resolveRankReportTargets, summarizeRankReport } from "./summary";

function summary(count: number) {
  const policy = reportPolicy();
  const targets = Array.from({ length: count }, (_, index) => ({
    ...reportTarget(),
    id: `target-${index}`,
  }));
  return summarizeRankReport(resolveRankReportTargets(targets, policy, "project-db"), policy);
}

describe("aggregate-only report presentation", () => {
  it("preserves whole-scope metrics and composition counts without per-target IDs or mutating the report", () => {
    const full = summary(120);
    full.metric.added = ["added-a", "added-b"];
    full.metric.removed = ["removed-a"];
    const before = structuredClone(full);
    const shown = presentReportSummary(full);
    expect(shown.metric.counts).toEqual(full.metric.counts);
    expect(shown.metric.value).toBe(full.metric.value);
    expect(shown.metric.delta).toBe(full.metric.delta);
    expect(shown.metric.compositionChanges).toEqual({ added: 2, removed: 1 });
    expect(shown.selectionDigest).toBe(full.selectionDigest);
    expect(JSON.stringify(shown)).not.toMatch(/target-|added-a|removed-a|contributions|exclusions/);
    expect(full).toEqual(before);
  });

  it("keeps missing baseline membership unknown and client size independent of target detail arrays", () => {
    const small = presentReportSummary(summary(120));
    const large = presentReportSummary(summary(2001));
    expect(large.metric.counts.expected).toBe(2001);
    expect(large.metric.compositionChanges).toBeNull();
    expect(large.metric.compositionReason).toBe("baseline_membership_unavailable");
    expect(large.metric.isTruncated).toBe(false);
    expect(JSON.stringify(large).length - JSON.stringify(small).length).toBeLessThan(100);
    expect(JSON.stringify(large).length).toBeLessThan(2000);
  });
});
