import { hostOrganicReportPolicy } from "@/lib/rank-reports/host-policy";
import { reportCheck, reportProject, reportTarget } from "@/lib/rank-reports/report-test-fixture";
import { resolveRankReportTargets, summarizeRankReport } from "@/lib/rank-reports/summary";
import { describe, expect, it } from "vitest";
import { fixtureAsOf, fixturePolicy, measurement } from "./fixtures";
import { qualifyMeasurement } from "./qualify";

const v2 = { ...fixturePolicy, allowShallowPositive: true };
describe("Visibility v2 shallow positive evidence", () => {
  it("preserves v1 while using a known Top 10 position in v2", () => {
    const value = measurement(6, { requestedDepth: 10, completeThrough: 9 });
    expect(qualifyMeasurement(value, fixturePolicy).reason).toBe("insufficient_depth");
    expect(qualifyMeasurement(value, v2).evidence).toBe("positive");
  });
  it("does not turn missing rows or unknown request depth into a confirmed absence", () => {
    expect(
      qualifyMeasurement(measurement(null, { requestedDepth: 10, completeThrough: 9 }), v2)
        .evidence,
    ).toBe("unknown");
    expect(
      qualifyMeasurement(measurement(null, { requestedDepth: 20, completeThrough: 19 }), v2).reason,
    ).toBe("unproven_absence");
    expect(qualifyMeasurement(measurement(6, { requestedDepth: null }), v2).evidence).toBe(
      "unknown",
    );
    expect(qualifyMeasurement(measurement(15, { requestedDepth: 10 }), v2).reason).toBe(
      "insufficient_depth",
    );
    expect(
      qualifyMeasurement(measurement(null, { requestedDepth: 20, completeThrough: 20 }), v2)
        .evidence,
    ).toBe("known_absent");
  });
  it("propagates the host v2 policy without changing the Top 20 score curve", () => {
    const policy = hostOrganicReportPolicy(fixtureAsOf);
    const shallow = { ...reportTarget(), checks: [reportCheck(6, { requestedDepth: 10 })] };
    const full = { ...reportTarget(), checks: [reportCheck(6, { requestedDepth: 20 })] };
    const score = (target: typeof shallow) =>
      summarizeRankReport(resolveRankReportTargets([target], policy, reportProject.id), policy);
    expect(policy.metric.definitionVersion).toBe("visibility-top20-v2");
    expect(score(shallow).metric.value).toBeGreaterThan(0);
    expect(score(shallow).metric.counts.metricEligible).toBe(1);
    expect(score(shallow).metric.value).toEqual(score(full).metric.value);
  });
});
