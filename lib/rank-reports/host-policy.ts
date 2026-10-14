import {
  VISIBILITY_DEFINITION_VERSION_V1,
  VISIBILITY_HORIZON,
  VISIBILITY_METRIC_ID_V1,
  VISIBILITY_POSITION_WEIGHTS_V1,
} from "@/lib/visibility/definition";
import type { RankReportLimits, RankReportPolicy } from "./model";

/** Server read budgets. A request exceeding them returns a capacity error, never a partial whole-project KPI. */
export const RANK_REPORT_HOST_LIMITS: Readonly<RankReportLimits> = {
  maxTargets: 10_000,
  maxChecks: 250_000,
  maxItems: 50_000,
};
export const RANK_REPORT_CALENDAR_CONFIGURATION = "host-own-calendar-v1";

/** V1 curve/depth are unchanged. Freshness and baseline tolerance come from each captured target policy. */
export function hostOrganicReportPolicy(asOf: Date, comparisonDays = 7): RankReportPolicy {
  if (
    !Number.isFinite(asOf.getTime()) ||
    !Number.isSafeInteger(comparisonDays) ||
    comparisonDays < 1 ||
    comparisonDays > 365
  ) {
    throw new Error("Invalid host report period.");
  }
  return {
    asOf: new Date(asOf.getTime()),
    baseline: {
      mode: "before",
      before: new Date(asOf.getTime() - comparisonDays * 86_400_000),
      notBefore: null,
    },
    currentNotBefore: null,
    freshForMs: null,
    horizon: VISIBILITY_HORIZON,
    metric: {
      curve: VISIBILITY_POSITION_WEIGHTS_V1,
      definitionVersion: VISIBILITY_DEFINITION_VERSION_V1,
      id: VISIBILITY_METRIC_ID_V1,
    },
    minimumRequestedDepth: VISIBILITY_HORIZON,
    weightProvenance: { market: null, period: null, source: "retained_provider_keyword_metrics" },
  };
}
