import type { ReportSummary } from "./model";

/** Aggregate-only client projection; per-target detail stays in authorized report reads. */
export type ReportSummaryPresentation = Omit<ReportSummary, "metric"> & {
  metric: Omit<ReportSummary["metric"], "contributions" | "exclusions" | "added" | "removed"> & {
    compositionChanges: { added: number; removed: number } | null;
  };
};

export function presentReportSummary(report: ReportSummary): ReportSummaryPresentation {
  const {
    contributions: _contributions,
    exclusions: _exclusions,
    added,
    removed,
    ...metric
  } = report.metric;
  return {
    ...report,
    metric: {
      ...metric,
      compositionChanges:
        added === null || removed === null
          ? null
          : { added: added.length, removed: removed.length },
    },
  };
}
