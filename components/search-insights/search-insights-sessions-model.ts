import { addDays } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type { OrganicSessionsPendingPresentation } from "@/lib/search-insights/queries/sessions-context";
import { GA4_SESSIONS_LABEL } from "./search-insights-copy";

/**
 * Why the second source has no number yet, in the module's own vocabulary. Pure mapping over the
 * stored import state, lifted out of the body so that file stays inside the size budget and this
 * logic can be read - and tested - on its own.
 */
const MAX_READY_MINUTES = 24 * 60;
export function readyInGa4Duration(importState: SearchInsightsImportState, period: string) {
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
  return `~${minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} hr`}`;
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
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: "Reconnect GA4 before the import can continue.",
      source: "GA4",
      status: "Needs reauth",
    };
  if (!importState)
    return {
      kind: "pending",
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: "The GA4 import is queued for worker pickup.",
      source: "GA4",
      status: "Queued",
    };
  if (importState.pausedReason === "user")
    return {
      kind: "pending",
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: "The GA4 import is paused until you resume it.",
      source: "GA4",
      status: "Paused by you",
    };
  if (importState.pausedReason === "rate_limited")
    return {
      kind: "pending",
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: "The GA4 provider limit will reset before the import resumes.",
      source: "GA4",
      status: "Paused by provider limits",
    };
  if (
    importState.state === "waiting_on_worker" ||
    importState.state === "waiting_for_worker" ||
    importState.state === "waiting_worker"
  )
    return {
      kind: "pending",
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: "The GA4 import is waiting for a background worker.",
      source: "GA4",
      status: "Waiting on worker",
    };
  if (importState.state === "failed" || importState.pausedReason === "error")
    return {
      kind: "pending",
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: "Retry the GA4 import to continue.",
      source: "GA4",
      status: "Needs retry",
    };
  if (importState.state === "completed") {
    const oneDayBehind = ga4IsOneDayBehind(
      gscImportState?.newestFinalizedDate ?? null,
      importState.finalizedThroughDate,
    );
    return {
      kind: "pending",
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: oneDayBehind
        ? "GA4 has not finalized today's data yet."
        : "GA4 history does not cover this comparison yet.",
      source: "GA4",
      status: oneDayBehind ? "Waiting for today's GA4 data" : "Complete",
    };
  }
  if (importState.state === "queued")
    return {
      kind: "pending",
      label: GA4_SESSIONS_LABEL,
      readyIn: null,
      reason: "The GA4 import is queued for worker pickup.",
      source: "GA4",
      status: "Queued",
    };
  return {
    kind: "pending",
    label: GA4_SESSIONS_LABEL,
    readyIn: readyInGa4Duration(importState, period),
    reason: "Importing newest GA4 ranges.",
    source: "GA4",
    status: "Running",
  };
}
