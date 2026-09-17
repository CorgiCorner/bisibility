import { type DateDisplayContext, formatDisplayDate } from "@/lib/dates/format";
import type {
  SearchBackfillPresentation,
  SearchSyncActionLabelKey,
  SearchSyncSupportingTextFact,
} from "@/lib/search-insights/sync/control-model";
import type { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;

type SearchSyncPresentationInput = Pick<
  SearchBackfillPresentation,
  "action" | "actionLabelKey" | "kind" | "supportingTextFact"
>;

export type PresentedSearchSync = {
  action: SearchSyncPresentationInput["action"];
  actionLabel: string | null;
  status: string;
  supportingText: string | null;
};

function actionLabel(key: SearchSyncActionLabelKey, t: Translate) {
  if (key === "choose_property") return t("syncActionChooseProperty");
  if (key === "connect") return t("syncActionConnect");
  if (key === "pause") return t("syncActionPause");
  if (key === "reconnect") return t("syncActionReconnect");
  if (key === "resume") return t("syncActionResume");
  if (key === "retry") return t("syncActionRetry");
  return null;
}

function duration(milliseconds: number, t: Translate) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return t("syncDurationSeconds", { count: seconds });
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? t("syncDurationMinutes", { count: minutes })
    : t("syncDurationHours", { count: Math.round(minutes / 60) });
}

function supportingText(
  fact: SearchSyncSupportingTextFact,
  formatDate: (value: string) => string | null,
  t: Translate,
) {
  if (!fact) return null;
  if (fact.kind === "all_imported_running") return t("syncSupportingAllImportedRunning");
  if (fact.kind === "connection_required") return t("syncSupportingConnectionRequired");
  if (fact.kind === "failed") return t("syncSupportingFailed", { error: fact.safeError ?? "none" });
  if (fact.kind === "import_running") return t("syncSupportingImportRunning");
  if (fact.kind === "next_request") {
    return t("syncSupportingNextRequest", { duration: duration(fact.milliseconds, t) });
  }
  if (fact.kind === "paused_provider") return t("syncSupportingPausedProvider");
  if (fact.kind === "paused_user") {
    return t("syncSupportingPausedUser", {
      date: fact.pausedAt ? (formatDate(fact.pausedAt) ?? "none") : "none",
    });
  }
  if (fact.kind === "queued") return t("syncSupportingQueued");
  if (fact.kind === "runtime_unavailable") return t("syncSupportingRuntimeUnavailable");
  if (fact.kind === "waiting_for_data") return t("syncSupportingWaitingForData");
  return t("syncSupportingWorkerUnavailable");
}

function status(kind: SearchSyncPresentationInput["kind"], t: Translate) {
  if (kind === "complete") return t("syncStatusCompleted");
  if (kind === "needs_reauth") return t("syncStatusReconnectRequired");
  if (kind === "needs_retry") return t("syncStatusFailed");
  if (kind === "paused_provider") return t("syncStatusWaitingForGoogle");
  if (kind === "paused_user") return t("syncStatusPaused");
  if (kind === "queued") return t("syncStatusQueued");
  if (kind === "running") return t("syncStatusImporting");
  if (kind === "waiting_for_first_data") return t("syncStatusWaitingForData");
  if (kind === "waiting_worker") return t("syncStatusDelayed");
  return t("syncStatusUnavailable");
}

/**
 * Sync facts store an instant, but their paused-day copy has always represented
 * its UTC calendar key. Keep that membership while honoring reader locale/order.
 */
export function formatSearchSyncCalendarDay(value: string, context: DateDisplayContext) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDisplayDate(date.toISOString().slice(0, 10), context);
}

/** Localizes only C's client Search Insights surfaces from structured sync facts. */
export function presentSearchSync(
  model: SearchSyncPresentationInput,
  t: Translate,
  formatDate: (value: string) => string | null,
): PresentedSearchSync {
  return {
    action: model.action,
    actionLabel: actionLabel(model.actionLabelKey, t),
    status: status(model.kind, t),
    supportingText: supportingText(model.supportingTextFact, formatDate, t),
  };
}
