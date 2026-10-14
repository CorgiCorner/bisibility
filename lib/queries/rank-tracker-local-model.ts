import type { LocalDashboardContext } from "@/lib/dashboard-local/model";
import type { LocalReportSummary } from "@/lib/local-reports/summary";
import type { rankReportTargetResolution } from "@/lib/rank-reports/resolution";

/** Only visible target facts and scalar full-scope summary cross the client boundary. */
export type RankTrackerLocalFact = {
  keywordId: string;
  presence: ReturnType<typeof rankReportTargetResolution>["current"];
  target: ReturnType<typeof rankReportTargetResolution>["current"];
  latestAttempt: ReturnType<typeof rankReportTargetResolution>["latestAttempt"];
};
export type RankTrackerLocalPresentation = {
  context: LocalDashboardContext;
  summary: LocalReportSummary | null;
  facts: readonly RankTrackerLocalFact[];
  unsupportedFilters: boolean;
};
