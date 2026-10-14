import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { describe, expect, it } from "vitest";
import { reportCheck, reportPolicy, reportProject, reportTarget } from "./report-test-fixture";
import { resolveRankReportTargets, summarizeRankReport } from "./summary";

const before = new Date("2026-10-05T12:00:00Z");
function target() {
  return {
    ...reportTarget(),
    freshForMs: 24 * 60 * 60 * 1000,
    checks: [
      reportCheck(2),
      reportCheck(6, {
        id: "check_bbcdefghijklmnopqrstuvwx",
        observationRun: {
          ...reportCheck(6).observationRun!,
          requestPolicy: {
            evidence: {
              version: 1,
              completeThrough: { organic_result: 100 },
              policyRevision: "policy-v1",
              targetRevision: "target-v1",
              observedAt: "2026-10-05T11:45:00Z",
            },
          },
        },
      }),
    ],
  };
}
function policy() {
  return { ...reportPolicy(), baseline: { mode: "before" as const, before, notBefore: null } };
}

describe("target comparison tolerance", () => {
  it("does not substitute the previous positive result when the target window is unknown", () => {
    const input = { ...target(), baselineWindow: null };
    const resolved = resolveRankReportTargets([input], policy(), reportProject.id);
    expect(resolved[0].resolution).toMatchObject({ baseline: null, movement: null });
    expect(summarizeRankReport(resolved, policy()).metric).toMatchObject({
      delta: null,
      counts: { comparable: 0 },
    });
    const expectedScope = recordedMeasurement(
      input.checks[0],
      input.id,
      reportProject.id,
    ).effectiveScope;
    expect(
      resolveCurrentRankTrackerTargets([{ ...input, expectedScope }], policy(), reportProject.id)[0]
        .resolution.baseline,
    ).toBeNull();
  });
  it("qualifies the same observation for a wider target window and excludes it for a narrow one", () => {
    const inputs = [
      { ...target(), baselineWindow: { before, notBefore: new Date("2026-10-05T11:59:00Z") } },
      {
        ...target(),
        id: "kw_bbcdefghijklmnopqrstuvwx",
        baselineWindow: { before, notBefore: new Date("2026-10-05T11:00:00Z") },
      },
    ];
    const resolved = resolveRankReportTargets(inputs, policy(), reportProject.id);
    expect(resolved.map(({ resolution }) => resolution.movement)).toEqual([null, 4]);
    expect(summarizeRankReport(resolved, policy()).metric.counts.comparable).toBe(1);
  });
  it("does not select an implicit previous baseline when comparison is disabled", () => {
    const resolved = resolveRankReportTargets(
      [target()],
      { ...policy(), baseline: { mode: "none" } },
      reportProject.id,
    );
    expect(resolved[0].resolution).toMatchObject({ baseline: null, movement: null });
  });
  it("rejects an inverted target window before resolving history", () => {
    expect(() =>
      resolveRankReportTargets(
        [
          {
            ...target(),
            baselineWindow: {
              before,
              notBefore: new Date("2026-10-05T12:01:00Z"),
            },
          },
        ],
        policy(),
        reportProject.id,
      ),
    ).toThrow("Target comparison window is invalid");
  });
});
