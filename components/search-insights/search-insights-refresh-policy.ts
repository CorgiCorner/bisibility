import type { SearchBackfillKind } from "@/lib/search-insights/sync/control-model";

const SELF_RESOLVING: ReadonlySet<SearchBackfillKind> = new Set([
  "queued",
  "running",
  "status_unavailable",
  "waiting_worker",
]);

export function searchInsightsSelfResolving(kind: SearchBackfillKind) {
  return SELF_RESOLVING.has(kind);
}

/** Running imports are checked twice as often as the other states that clear on their own. */
export function searchInsightsRefreshIntervalMs(kind: SearchBackfillKind) {
  return kind === "running" ? 45_000 : 90_000;
}
