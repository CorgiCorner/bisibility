import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { expect, it } from "vitest";
import { rankReportRecords } from "./records";
import { reportCheck, reportPolicy, reportProject, reportTarget } from "./report-test-fixture";
import { resolveRankReportTargets } from "./summary";

it("keeps proven historic ranks on their original revisions while current comparison excludes incompatible history", () => {
  const current = reportCheck(2);
  const historical = reportCheck(1, {
    id: "check_bbcdefghijklmnopqrstuvwx",
    observationRun: {
      ...current.observationRun!,
      requestPolicy: {
        evidence: {
          version: 1,
          completeThrough: { organic_result: 100 },
          targetRevision: "target-previous",
          policyRevision: "policy-previous",
          observedAt: "2026-09-29T10:00:00Z",
        },
      },
    },
  });
  const input = {
    ...reportTarget(),
    checks: [current, historical],
    expectedScope: recordedMeasurement(current, reportTarget().id, reportProject.id).effectiveScope,
  };
  const history = rankReportRecords([input], reportPolicy(), reportProject.id, "retained_scope");
  expect(history.map(({ observation }) => observation?.position)).toEqual([2, 1]);
  expect(history[1].observation?.configuredScope?.targetRevision).toBe("target-previous");
  expect(history[0].observation?.comparisonDigest).not.toBe(
    history[1].observation?.comparisonDigest,
  );
  expect(
    resolveRankReportTargets([input], reportPolicy(), reportProject.id)[0].resolution,
  ).toMatchObject({ baseline: null, movement: null });
});
