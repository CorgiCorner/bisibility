"use client";

import { useDateDisplay, useDateFormat } from "@/components/dates/DateFormatProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import type { DataIncident } from "@/lib/search-insights/constants";
import { formatPacificTimestampDisplayValue } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsCoverage } from "@/lib/search-insights/queries/coverage";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import {
  resolveSearchSyncControl,
  type SearchSyncControlFacts,
  selectSearchImportCoverage,
} from "@/lib/search-insights/sync/control-model";
import { useTranslations } from "next-intl";
import { SearchInsightsRefresh } from "./SearchInsightsRefresh";
import { EmphasizedDate, IncidentPill, TrustStripCell } from "./SearchInsightsTrustStripPrimitives";
import { SearchInsightsWaitingStrip } from "./SearchInsightsWaitingStrip";
import { SearchSyncStatusControl } from "./SearchSyncStatusControl";
import { importProgress } from "./search-insights-import-progress";
import { formatSearchSyncCalendarDay, presentSearchSync } from "./search-sync-presentation";

export type SearchInsightsTrustStripProps = {
  canManageProviders?: boolean;
  coverage: SearchInsightsCoverage;
  deploymentMode: "cloud" | "self-host";
  localViewReady: boolean;
  providerAvailabilitySource: "fallback" | "metadata" | null;
  providerAvailableThrough: string | null;
  importState: SearchInsightsImportState | null;
  incidents: readonly DataIncident[];
  pauseAction?: SearchInsightsImportAction;
  resumeAction?: SearchInsightsImportAction;
  retryAction?: SearchInsightsImportAction;
  projectId?: string;
  statusFacts?: SearchSyncControlFacts;
  workerStatus: WorkerTemporalStatus;
};
const FACT = "text-ui-body text-fg";
const VALUE = "font-sans tabular-nums font-semibold";
const NOTE = "mt-auto pt-2 text-ui-caption text-fg-muted";
function ImportLine({
  canManageProviders,
  hideRefresh = false,
  facts,
  importState,
  projectId = "",
  statusFacts,
}: Readonly<{
  canManageProviders: boolean;
  hideRefresh?: boolean;
  facts: ImportObservabilityFacts | null;
  importState: SearchInsightsImportState | null;
  pauseAction?: SearchInsightsImportAction;
  projectId?: string;
  resumeAction?: SearchInsightsImportAction;
  retryAction?: SearchInsightsImportAction;
  statusFacts: SearchSyncControlFacts;
}>) {
  const dateDisplay = useDateDisplay();
  const dateFormat = useDateFormat();
  const t = useTranslations("projectSearchInsights.copy");
  const progress = importProgress(importState, facts);
  if (progress.state === "none") return null;
  const model = resolveSearchSyncControl(statusFacts, dateFormat);
  const localizedModel = presentSearchSync(model, t, (value) =>
    formatSearchSyncCalendarDay(value, dateDisplay),
  );
  const displayModel =
    model.action === "reconnect" ? model : { ...model, action: null, actionLabel: null };
  const displayPresentation = {
    ...localizedModel,
    action: displayModel.action,
    actionLabel: displayModel.action ? localizedModel.actionLabel : null,
  };
  const actionLabel = (action: "pause" | "reconnect" | "resume" | "retry") =>
    action === "pause"
      ? t("syncActionPause")
      : action === "resume"
        ? t("syncActionResume")
        : action === "retry"
          ? t("syncActionRetry")
          : t("syncActionReconnect");
  const reconnectHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: searchConsolePath(asProjectRef(projectId)),
  });
  const refresh = hideRefresh ? null : <SearchInsightsRefresh active={false} />;
  return (
    <div
      className={`${NOTE} flex w-full items-center justify-between`}
      data-testid="search-import-line"
    >
      <SearchSyncStatusControl
        disabled={!canManageProviders}
        leadingActionNode={refresh}
        labels={{
          actionAriaLabel: (action) => t("syncActionAria", { action: actionLabel(action) }),
          askAdminToConnect: t("syncAskAdminToConnect"),
          pauseTooltip: t("syncPauseTooltip"),
        }}
        model={displayPresentation}
        reconnectHref={reconnectHref}
      />
    </div>
  );
}
export function SearchInsightsTrustStrip({
  canManageProviders = true,
  coverage,
  deploymentMode,
  localViewReady,
  providerAvailabilitySource,
  providerAvailableThrough,
  importState,
  incidents,
  pauseAction,
  projectId,
  resumeAction,
  statusFacts,
  workerStatus,
}: Readonly<SearchInsightsTrustStripProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const dateDisplay = useDateDisplay();
  const facts = importState?.facts ?? statusFacts?.observability ?? null;
  const now = new Date();
  const importCoverage = facts ? selectSearchImportCoverage({ observability: facts }) : null;
  const targetMonths = facts ? Math.max(0, Math.round(facts.deepHistoryMonths.target)) : 0;
  const completedMonths = facts
    ? Math.min(targetMonths, Math.max(0, Math.round(facts.deepHistoryMonths.completed)))
    : 0;
  const progress = facts
    ? {
        deepHistory: t("trustDeepHistory", { completed: completedMonths, total: targetMonths }),
        qualifyingCounter:
          importCoverage && importCoverage.completed !== null && importCoverage.total !== null
            ? t("syncCoverageDays", {
                completed: importCoverage.completed,
                total: importCoverage.total,
              })
            : t("syncCoverageUnavailable"),
      }
    : null;
  const lastProbeAt = facts?.lastProbeAt ?? importState?.lastProbeAt ?? null;
  const freshness = (() => {
    if (!lastProbeAt) {
      return { label: t("freshnessUnknown"), tooltip: t("freshnessUnknownNote") };
    }
    const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(lastProbeAt)) / 60_000));
    const relative =
      minutes < 1
        ? t("freshnessRelativeJustNow")
        : minutes < 60
          ? t("freshnessRelativeMinutes", { count: minutes })
          : minutes < 24 * 60
            ? t("freshnessRelativeHours", { count: Math.floor(minutes / 60) })
            : t("freshnessRelativeDays", { count: Math.floor(minutes / (24 * 60)) });
    return {
      label: t("freshnessChecked", { relative }),
      tooltip: t("freshnessTooltip", {
        adjustment: t("freshnessAdjustmentTooltip"),
        timestamp: formatPacificTimestampDisplayValue(new Date(lastProbeAt), dateDisplay),
      }),
    };
  })();
  const retentionMonths = importState?.plannedRetentionMonths ?? 16;
  const retention =
    retentionMonths >= 16
      ? deploymentMode === "cloud"
        ? t("retentionFullCloud")
        : t("retentionFullSelfHost")
      : deploymentMode === "cloud"
        ? t("retentionPlannedCloud", { months: retentionMonths })
        : t("retentionPlannedSelfHost", { months: retentionMonths });
  if (!providerAvailableThrough) {
    if (!localViewReady) return null;
    return (
      <SearchInsightsWaitingStrip
        deploymentMode={deploymentMode}
        facts={facts}
        importState={importState}
        pauseAction={pauseAction}
        projectId={projectId}
        resumeAction={resumeAction}
        statusFacts={statusFacts}
        workerStatus={workerStatus}
      />
    );
  }

  return (
    <section
      aria-label={t("dataProvenanceAria")}
      className="grid grid-cols-1 border-t border-border bg-bg-elev xl:grid-cols-3"
    >
      <TrustStripCell label={t("trustFreshness")} trailing={<IncidentPill incidents={incidents} />}>
        <span className={FACT}>
          {providerAvailabilitySource === "metadata"
            ? `${t("freshnessFinalPrefix")} `
            : `${t("freshnessEstimatedFinalPrefix")} `}
          <EmphasizedDate compact value={providerAvailableThrough} />
        </span>
        {progress ? (
          <span className={NOTE} data-testid="qualifying-progress">
            {progress.qualifyingCounter}
          </span>
        ) : null}
        <Tooltip content={freshness.tooltip} semantics="description">
          <span className={NOTE} data-testid="freshness-note">
            {freshness.label}
          </span>
        </Tooltip>
      </TrustStripCell>
      <TrustStripCell divided label={t("trustCoverage")}>
        {coverage.calculable ? (
          <>
            <span className={FACT}>
              {t.rich("trustCoverageSummary", {
                capHit:
                  coverage.capHitDays > 0 ? t("coverageCapHit", { days: coverage.capHitDays }) : "",
                clicks: coverage.clicksShare,
                clicksValue: (chunks) => <strong className={VALUE}>{chunks}</strong>,
                impressions: coverage.impressionsShare,
                impressionsValue: (chunks) => <strong className={VALUE}>{chunks}</strong>,
              })}
            </span>
            <span className={NOTE}>{t("coverageNote")}</span>
          </>
        ) : (
          <span className={FACT}>
            {(facts?.qualifyingDays ?? 0) > 0
              ? t("coveragePendingWindow")
              : t("coveragePendingFirstDays")}
          </span>
        )}
      </TrustStripCell>
      <TrustStripCell divided label={t("trustRetention")}>
        <span className={FACT}>{retention}</span>
        {progress ? (
          <span className={NOTE} data-testid="deep-history-progress">
            {progress.deepHistory}
          </span>
        ) : null}
      </TrustStripCell>
      {localViewReady && statusFacts ? (
        <div className="col-span-full border-t border-border px-4 py-2.5">
          <ImportLine
            canManageProviders={canManageProviders}
            facts={facts}
            importState={importState}
            projectId={projectId}
            statusFacts={statusFacts}
          />
        </div>
      ) : null}
    </section>
  );
}
