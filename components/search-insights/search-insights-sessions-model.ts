import { addDays } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type { OrganicSessionsPendingPresentation } from "@/lib/search-insights/queries/sessions-context";

/**
 * Why the second source has no number yet, in the module's own vocabulary. Pure mapping over the
 * stored import state, lifted out of the body so that file stays inside the size budget and this
 * logic can be read - and tested - on its own.
 */
const MAX_READY_MINUTES = 24 * 60;
export function readyInGa4Minutes(importState: SearchInsightsImportState, period: string) {
  const periodDays = Number(period);
  if (
    !Number.isSafeInteger(periodDays) ||
    periodDays <= 0 ||
    !Number.isSafeInteger(importState.daysTotal)
  )
    return null;
  const comparedDays = Math.min(importState.daysTotal, periodDays * 2);
  const daysDone = Math.min(importState.daysTotal, Math.max(0, importState.daysDone));
  const daysRemaining = Math.max(0, comparedDays - daysDone);
  const startedAt = importState.lastSyncStartedAt ?? importState.createdAt;
  const elapsedMs =
    startedAt && importState.updatedAt
      ? Date.parse(importState.updatedAt) - Date.parse(startedAt)
      : NaN;
  if (daysDone <= 0 || daysRemaining <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 60_000)
    return null;
  const minutes = Math.ceil((daysRemaining * elapsedMs) / (daysDone * 60_000));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_READY_MINUTES) return null;
  return minutes;
}

export function ga4IsOneDayBehind(
  gscFinalizedThroughDate: string | null,
  ga4FinalizedThroughDate: string | null,
) {
  if (!gscFinalizedThroughDate || !ga4FinalizedThroughDate) return false;
  try {
    return addDays(ga4FinalizedThroughDate, 1) === gscFinalizedThroughDate;
  } catch {
    return false;
  }
}

export function organicSessionsPendingPresentation(
  organicSessions: SearchInsightsFirstView["organicSessions"],
  gscImportState: SearchInsightsImportState | null,
  period: string,
): OrganicSessionsPendingPresentation {
  const { importState } = organicSessions;
  if (organicSessions.status === "needs_reauth" || importState?.pausedReason === "needs_reauth")
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: "needs_reauth",
      source: "ga4",
      status: "needs_reauth",
    };
  if (!importState)
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: "queued",
      source: "ga4",
      status: "queued",
    };
  if (importState.pausedReason === "user")
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: "paused_by_user",
      source: "ga4",
      status: "paused_by_user",
    };
  if (importState.pausedReason === "rate_limited")
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: "paused_by_provider",
      source: "ga4",
      status: "paused_by_provider",
    };
  if (
    importState.state === "waiting_on_worker" ||
    importState.state === "waiting_for_worker" ||
    importState.state === "waiting_worker"
  )
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: "waiting_on_worker",
      source: "ga4",
      status: "waiting_on_worker",
    };
  if (importState.state === "failed" || importState.pausedReason === "error")
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: "needs_retry",
      source: "ga4",
      status: "needs_retry",
    };
  if (importState.state === "completed") {
    const oneDayBehind = ga4IsOneDayBehind(
      gscImportState?.newestFinalizedDate ?? null,
      importState.finalizedThroughDate,
    );
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: oneDayBehind ? "waiting_for_today" : "history_not_covered",
      source: "ga4",
      status: oneDayBehind ? "waiting_for_today" : "complete",
    };
  }
  if (importState.state === "queued")
    return {
      kind: "pending",
      readyInMinutes: null,
      reason: "queued",
      source: "ga4",
      status: "queued",
    };
  return {
    kind: "pending",
    readyInMinutes: readyInGa4Minutes(importState, period),
    reason: "running",
    source: "ga4",
    status: "running",
  };
}
