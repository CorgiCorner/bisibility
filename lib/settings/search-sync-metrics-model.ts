import { plannedRemainingRequests } from "@/lib/search-insights/sync/plan";

type MetricsInput = {
  daysDone: number;
  daysTotal: number;
  lastQuotaPausedAt: Date | null;
  planned: boolean;
  requestsToday: number;
};
export function deriveSearchSyncMetrics(input: MetricsInput) {
  return {
    lastQuotaPausedAt: input.lastQuotaPausedAt,
    plannedRemaining: plannedRemainingRequests(input).plannedRequestBudget,
    requestsToday: input.requestsToday,
  };
}
