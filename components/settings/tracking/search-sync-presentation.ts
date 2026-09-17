import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDateTime } from "@/lib/dates/format";
import type {
  SearchSyncControlFacts,
  SearchSyncControlModel,
} from "@/lib/search-insights/sync/control-model";
import { selectSearchImportCoverage } from "@/lib/search-insights/sync/control-model";

type Translate = (key: string, values?: Record<string, number | string>) => string;

function nextRequestIn(facts: SearchSyncControlFacts) {
  const milliseconds = facts.observability?.stall.nextRequestInMs;
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null;
  }
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return { duration: seconds, unit: "seconds" };
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? { duration: minutes, unit: "minutes" }
    : { duration: Math.round(minutes / 60), unit: "hours" };
}

/** Maps durable state facts to the narrow settings feature's translated presentation. */
export function localizeSearchSyncControl({
  control,
  dateDisplay,
  facts,
  t,
}: Readonly<{
  control: SearchSyncControlModel;
  dateDisplay: DateDisplayContext;
  facts: SearchSyncControlFacts;
  t: Translate;
}>) {
  const pausedOn = facts.pauseStartedAt
    ? formatDisplayDateTime(new Date(facts.pauseStartedAt), dateDisplay)
    : null;
  const request = nextRequestIn(facts);
  const coverage = selectSearchImportCoverage(facts);
  const supportingText =
    control.kind === "complete"
      ? null
      : control.kind === "needs_retry"
        ? t("control.failedSupport")
        : control.kind === "paused_provider"
          ? t("control.quotaSupport")
          : control.kind === "paused_user"
            ? pausedOn
              ? t("control.pausedOn", { date: pausedOn })
              : t("control.pausedSupport")
            : control.kind === "queued"
              ? t("control.queuedSupport")
              : control.kind === "running"
                ? coverage.total !== null && coverage.completed === coverage.total
                  ? t("control.allPlannedRunning")
                  : request
                    ? t("control.nextRequestIn", request)
                    : t("control.runningSupport")
                : control.kind === "waiting_for_first_data"
                  ? t("control.waitingForDataSupport")
                  : control.kind === "waiting_worker"
                    ? t("control.delayedSupport")
                    : control.kind === "status_unavailable"
                      ? t("control.statusUnavailableSupport")
                      : facts.connectionStatus === "connected_no_property"
                        ? t("control.choosePropertySupport")
                        : facts.connectionStatus === "not_connected"
                          ? t("control.connectSupport")
                          : t("control.reconnectSupport");
  const actionLabel =
    control.action === "pause"
      ? t("control.pause")
      : control.action === "resume"
        ? t("control.resume")
        : control.action === "retry"
          ? t("control.retry")
          : control.action === "reconnect"
            ? facts.connectionStatus === "connected_no_property"
              ? t("control.chooseProperty")
              : facts.connectionStatus === "not_connected"
                ? t("control.connect")
                : t("control.reconnect")
            : null;
  const status =
    control.kind === "complete"
      ? t("control.completed")
      : control.kind === "needs_retry"
        ? t("control.failed")
        : control.kind === "paused_provider"
          ? t("control.waitingForGoogle")
          : control.kind === "paused_user"
            ? t("control.paused")
            : control.kind === "queued"
              ? t("control.queued")
              : control.kind === "running"
                ? t("control.importing")
                : control.kind === "waiting_for_first_data"
                  ? t("control.waitingForData")
                  : control.kind === "waiting_worker"
                    ? t("control.delayed")
                    : control.kind === "status_unavailable"
                      ? t("control.statusUnavailable")
                      : t("control.reconnectRequired");
  return { ...control, actionLabel, status, supportingText };
}
