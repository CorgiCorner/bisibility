"use client";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/toast-context";
import type {
  ExportSearchInsightsCsvAction,
  SyncSearchInsightsNowAction,
} from "@/lib/actions/search-insights";
import { track } from "@/lib/analytics/client";
import {
  SEARCH_INSIGHTS_EXPORT_ROW_CAP,
  SYNC_NOW_COOLDOWN_MS,
} from "@/lib/search-insights/constants";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { downloadTextFile } from "@/lib/ui/download";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import { type SyncView, syncView } from "./search-insights-workspace-model";

type ActionsProps = {
  exportAction: ExportSearchInsightsCsvAction;
  importState: SearchInsightsImportState | null;
  hasProperty: boolean;
  period: string;
  projectId: string;
  queryCount: number;
  readOnly?: boolean;
  syncAction: SyncSearchInsightsNowAction;
};

function useCooldownActive(expiresAt: number | null) {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (expiresAt === null || expiresAt <= Date.now()) return () => undefined;
      const timer = window.setInterval(() => {
        notify();
        if (Date.now() >= expiresAt) window.clearInterval(timer);
      }, 1_000);
      return () => window.clearInterval(timer);
    },
    [expiresAt],
  );
  const getSnapshot = useCallback(() => expiresAt !== null && Date.now() < expiresAt, [expiresAt]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function SearchInsightsActions({
  exportAction,
  importState,
  hasProperty,
  period,
  projectId,
  queryCount,
  readOnly = false,
  syncAction,
}: Readonly<ActionsProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const { showToast } = useToast();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [cooldownExpiresAt, setCooldownExpiresAt] = useState<number | null>(null);
  const cooldownActive = useCooldownActive(cooldownExpiresAt);
  const sync = syncView(importState, cooldownActive ? "cooldown" : "idle", hasProperty);

  async function exportCsv() {
    setExporting(true);
    try {
      const result = await exportAction({ period, projectId });
      downloadTextFile(result.csv, result.filename, "text/csv;charset=utf-8");
      track("search_insights_csv_exported", { rows: result.rows });
      // The button names the window's real query count, so a capped file has to say it stopped.
      if (result.truncated) {
        showToast(t("exportTruncated", { count: SEARCH_INSIGHTS_EXPORT_ROW_CAP }), {
          severity: "warning",
        });
      }
    } catch (error) {
      showToast(actionErrorMessage(error, t("exportFailed")), { severity: "error" });
    } finally {
      setExporting(false);
    }
  }

  // A rejected action must reach the user: without this the button would sit on "Sync now"
  // while the failure disappeared into an unhandled rejection.
  async function runSync() {
    try {
      const result = await syncAction({ projectId });
      if (result.status === "queued" || result.status === "cooldown") {
        const nextAllowedAt = result.nextAllowedAt ? Date.parse(result.nextAllowedAt) : NaN;
        setCooldownExpiresAt(
          result.status === "cooldown" && Number.isFinite(nextAllowedAt)
            ? nextAllowedAt
            : Date.now() + SYNC_NOW_COOLDOWN_MS,
        );
        return;
      }
      showToast(syncToast(result.status, t), {
        severity:
          result.status === "no_connection"
            ? "connection"
            : result.status === "already_running"
              ? "progress"
              : "info",
      });
    } catch (error) {
      showToast(actionErrorMessage(error, t("syncFailed")), { severity: "error" });
    }
  }

  return (
    <>
      {/* The bar wraps below the desktop breakpoint; the spacer is a margin so it does not
          survive the wrap as an empty column. */}
      <Button
        className="lg:ml-auto"
        loading={exporting}
        onClick={() => void exportCsv()}
        size="sm"
        startIcon={<DownloadSimple weight="regular" size={14} />}
        variant="secondary"
      >
        {t("exportCsv", { count: queryCount })}
      </Button>
      <Button
        aria-label={t("refreshAriaLabel")}
        loading={refreshing}
        loadingIndicator={
          <ArrowClockwise weight="regular" aria-hidden className="animate-spin" size={14} />
        }
        onClick={() => startRefresh(() => router.refresh())}
        size="sm"
        startIcon={<ArrowClockwise weight="regular" aria-hidden size={14} />}
        variant="secondary"
      >
        {t("refresh")}
      </Button>
      {readOnly ? null : (
        <Tooltip
          content={syncTitle(sync, t, importState?.plannedRetentionMonths ?? 16)}
          semantics="description"
        >
          <span>
            <Button
              disabled={sync.disabled}
              onClick={() => void runSync()}
              size="sm"
              startIcon={<ArrowsClockwise weight="regular" size={14} />}
              variant="secondary"
            >
              {t("syncNow")}
            </Button>
          </span>
        </Tooltip>
      )}
    </>
  );
}

function syncToast(
  status: "already_running" | "no_connection" | "unavailable",
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  if (status === "already_running") return t("syncToastAlreadyRunning");
  if (status === "no_connection") return t("syncToastNoConnection");
  return t("syncToastUnavailable");
}

function syncTitle(
  sync: SyncView,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
  months: number,
) {
  switch (sync.title) {
    case "backfill":
      return t("syncTitleBackfill", { months });
    case "cooldown":
      return t("syncTitleCooldown");
    case "paused_provider":
      return t("syncTitlePausedProvider");
    case "paused_reauth":
      return t("syncTitlePausedReauth");
    case "paused_retry":
      return t("syncTitlePausedRetry");
    case "paused_user":
      return t("syncTitlePausedUser");
    case "ready":
      return t("syncTitleReady");
    case "requires_property":
      return t("syncTitleRequiresProperty");
  }
}
