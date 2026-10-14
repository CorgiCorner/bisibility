import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import { reportDigest } from "@/lib/rank-reports/digest";
import { rankReportRecords } from "@/lib/rank-reports/records";
import {
  reportAsOf,
  reportCheck,
  reportKeyword,
  reportPolicy,
  reportProject,
  reportTarget,
} from "@/lib/rank-reports/report-test-fixture";
import { rankReportTargetResolution } from "@/lib/rank-reports/resolution";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import type { HistoryExportSnapshot } from "./export-snapshot";

export function historyExportSnapshotFixture(): HistoryExportSnapshot {
  const policy = reportPolicy();
  const target = {
    ...reportTarget(),
    checks: [
      reportCheck(4, {
        previousPosition: 9,
        startedAt: null,
        finishedAt: null,
        rankingUrl: "https://example.test/old",
      }),
      reportCheck(null, {
        id: "check_bbcdefghijklmnopqrstuvwx",
        status: "failed",
        errorCode: "provider_failed",
        createdAt: new Date("2026-10-12T11:00:00Z"),
        startedAt: new Date("2026-10-12T10:59:30Z"),
        finishedAt: new Date("2026-10-12T11:00:00Z"),
        updatedAt: new Date("2026-10-12T11:00:00Z"),
        observationRun: null,
      }),
    ],
    expectedScope: null,
  };
  const resolved = resolveCurrentRankTrackerTargets([target], policy, reportProject.id);
  return {
    asOf: reportAsOf.toISOString(),
    policy,
    project: reportProject,
    targets: [target],
    membership: "full_project_retained_history",
    keywords: [
      {
        id: "keyword-db",
        publicId: reportKeyword,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        device: "mobile",
        location: "Krakow",
        text: "=literal keyword",
        targetUrl: "https://example.test/today",
        topic: null,
        intent: null,
        tags: [],
      },
    ],
    sourceDigest: reportDigest({ targets: [target], policy }),
    records: rankReportRecords([target], policy, reportProject.id, "retained_scope"),
    unobservedRecords: [],
    unresolvedMembershipCount: 0,
    normalizedItemLimit: 1000,
    resolutions: resolved.map((row) => ({
      ...rankReportTargetResolution(row, policy),
      currentScopeState: row.currentScopeState,
      lastKnown: rankReportTargetResolution(row.historicalResolution, policy),
    })),
    summary: summarizeRankReport(resolved, policy),
  };
}
