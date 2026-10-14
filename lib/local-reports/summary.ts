import type { LocalReport } from "@/lib/dashboard-local/model";

/** The interactive UI receives only its summary, not ten thousand per-target report rows. */
export function localReportSummary(report: LocalReport) {
  return {
    asOf: report.asOf,
    subject: report.subject,
    expected: report.expected,
    retainedChecks: report.retainedChecks,
    presence: report.presence.value,
    targetTop3: report.targetTop3.value,
    conditionalTop3: report.conditionalTop3.value,
    averageFoundSlot: report.averageFoundSlot,
    averageFoundCount: report.averageFoundCount,
    matchCoverage: report.matchCoverage,
    observedCoverage: report.targetTop3.observedCoverage,
    counts: report.targetTop3.counts,
    freshness: report.targetTop3.freshness,
  };
}
export type LocalReportSummary = ReturnType<typeof localReportSummary>;
