import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import { validateRankTrackerReportPolicy } from "./rank-tracker-report-policy";
import { validateRankTrackerReportQuery } from "./rank-tracker-report-query";
import { reportPolicy, reportProject } from "./rank-tracker-report-test-fixture";

describe("server-owned rank tracker report contract", () => {
  it("refuses invalid or silently widening filter input rather than resolving another query", () => {
    expect(() =>
      validateRankTrackerReportQuery({
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, change: "made-up" },
      }),
    ).toThrow();
    expect(() =>
      validateRankTrackerReportQuery({
        ...defaultRankTrackerQueryState,
        lens: { device: "all", locationId: "x".repeat(121) },
      }),
    ).toThrow();
    expect(() =>
      validateRankTrackerReportQuery({
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, volMin: 10, volMax: 5 },
      }),
    ).toThrow();
  });
  it("requires independently retained baseline project provenance and explicit positive read budgets", () => {
    const policy = reportPolicy();
    const limits = { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 };
    expect(() =>
      validateRankTrackerReportPolicy(
        { ...policy, baselineExpectedIds: ["kw_abcdefghijklmnopqrstuvwx"] },
        policy.asOf,
        limits,
        reportProject.publicId,
      ),
    ).toThrow();
    expect(() =>
      validateRankTrackerReportPolicy(
        policy,
        policy.asOf,
        { ...limits, maxChecks: 0 },
        reportProject.publicId,
      ),
    ).toThrow();
    expect(() =>
      validateRankTrackerReportPolicy(policy, policy.asOf, limits, reportProject.publicId),
    ).not.toThrow();
  });
});
