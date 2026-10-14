import { rankTrackerQualityFixture } from "@/lib/queries/rank-tracker-report-test-fixture";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import type { RankReportTarget, RetainedReportCheck } from "@/lib/rank-reports/model";
import {
  reportCheck,
  reportKeyword,
  reportPolicy,
  reportProject,
} from "@/lib/rank-reports/report-test-fixture";
import { projectKeywordDetailQuality } from "./quality-projector";

export function detailCheck(
  index: number,
  position: number | null = 6,
  overrides: Partial<RetainedReportCheck> = {},
  observedAt = new Date(Date.UTC(2026, 9, 12, 10, 0, 0, index)),
): RetainedReportCheck {
  const recordedAt = new Date(observedAt.getTime() + 1000);
  const original = reportCheck(position);
  if (!original.observationRun) throw new Error("Expected captured observation fixture");
  return {
    ...original,
    id: `check_${index.toString().padStart(24, "0")}`,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    checkedAt: new Date(recordedAt.getTime() + 1000),
    finishedAt: recordedAt,
    observationRun: {
      ...original.observationRun,
      createdAt: recordedAt,
      requestPolicy: {
        evidence: {
          completeThrough: { organic_result: 100 },
          observedAt: observedAt.toISOString(),
          policyRevision: "policy-v1",
          targetRevision: "target-v1",
          version: 1,
        },
      },
    },
    ...overrides,
  };
}
export function detailTarget(
  checks: readonly RetainedReportCheck[] = [detailCheck(0)],
): RankReportTarget {
  const expectedScope = recordedMeasurement(
    reportCheck(6),
    reportKeyword,
    reportProject.id,
  ).effectiveScope;
  return { checks, expectedScope, id: reportKeyword, volume: null };
}
export function detailProjection(target = detailTarget(), policy = reportPolicy()) {
  const { row } = rankTrackerQualityFixture();
  return projectKeywordDetailQuality(
    {
      ...row,
      bestPosition: 99,
      position: 99,
      completedComparableChecks: [
        { checkedAt: "2000-01-01T00:00:00Z", position: 99, rankingUrl: "/obsolete" },
      ],
    },
    [target],
    policy,
    reportProject.id,
    "same-report-snapshot",
  );
}
