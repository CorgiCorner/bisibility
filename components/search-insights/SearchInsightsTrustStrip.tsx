"use client";

import { Tooltip } from "@/components/ui";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import type { DataIncident } from "@/lib/search-insights/constants";
import { formatDateLabel } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsCoverage } from "@/lib/search-insights/queries/coverage";
import { resolveSearchSyncControl } from "@/lib/search-insights/sync/control-model";
import type { ReactNode } from "react";
import { SearchImportPauseControl } from "./SearchImportPauseControl";
import { SearchInsightsRefresh } from "./SearchInsightsRefresh";
import { SearchInsightsWaitingStrip } from "./SearchInsightsWaitingStrip";
import { SearchSyncStatusControl } from "./SearchSyncStatusControl";
import {
  COVERAGE_EMPTY,
  COVERAGE_NOTE,
  INCIDENT_PILL,
  importDoneCopy,
  retentionOwnershipCopy,
  TRUST_LABELS,
} from "./search-insights-copy";
import {
  capHitClause,
  freshnessNote,
  importProgress,
  incidentTooltip,
} from "./search-insights-trust-model";

export type SearchInsightsTrustStripProps = {
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
  workerStatus: WorkerTemporalStatus;
};
const CELL = "flex flex-col gap-1.5 px-4 py-3";
const LABEL = "font-mono text-ui-micro uppercase tracking-wide text-fg-muted";
const FACT = "text-ui-body text-fg";
const VALUE = "font-mono font-semibold";
const NOTE = "mt-auto pt-2 text-ui-caption text-fg-muted";
function Cell({
  children,
  divided,
  label,
  trailing,
}: Readonly<{ children: ReactNode; divided?: boolean; label: string; trailing?: ReactNode }>) {
  return (
    <div className={divided ? `${CELL} border-t border-border xl:border-l xl:border-t-0` : CELL}>
      <span className="flex items-center gap-2">
        <span className={LABEL}>{label}</span>
        {trailing}
      </span>
      {children}
    </div>
  );
}

function EmphasizedDate({
  compact = false,
  value,
}: Readonly<{ compact?: boolean; value: string }>) {
  const label = formatDateLabel(value);
  const comma = label.lastIndexOf(",");
  const day = comma === -1 ? label : label.slice(0, comma);
  const year = comma === -1 ? "" : label.slice(comma + 1).trim();
  const showYear = !compact && year.length > 0;
  return (
    <strong className="font-semibold" data-testid="provider-available-date">
      <span className="font-mono">{day}</span>
      {showYear ? <span>, </span> : null}
      {showYear ? <span className="font-mono">{year}</span> : null}
    </strong>
  );
}
function IncidentPill({ incidents }: Readonly<{ incidents: readonly DataIncident[] }>) {
  if (incidents.length === 0) return null;
  return (
    <Tooltip content={incidentTooltip(incidents)}>
      <span className="cursor-help rounded-full bg-bg-inset px-2 py-0.5 font-mono text-ui-micro text-fg-muted">
        {INCIDENT_PILL}
      </span>
    </Tooltip>
  );
}
function ImportLine({
  hideRefresh = false,
  importState,
  pauseAction = unavailablePauseAction,
  projectId = "",
  resumeAction = unavailablePauseAction,
  retryAction = unavailablePauseAction,
}: Readonly<{
  hideRefresh?: boolean;
  importState: SearchInsightsImportState | null;
  pauseAction?: SearchInsightsImportAction;
  projectId?: string;
  resumeAction?: SearchInsightsImportAction;
  retryAction?: SearchInsightsImportAction;
}>) {
  const progress = importProgress(importState);
  if (progress.state === "none") return null;
  if (progress.state === "done") {
    return (
      <span className={NOTE}>{importDoneCopy(importState?.plannedRetentionMonths ?? 16)}</span>
    );
  }
  const model = resolveSearchSyncControl({
    lastActivityAt: importState?.lastActivityAt,
    pauseStartedAt: importState?.pauseStartedAt,
    pausedReason: importState?.pausedReason,
    safeError: importState?.safeError,
    state: importState?.state,
  });
  const reconnectHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: searchConsolePath(asProjectRef(projectId)),
  });
  const action =
    model.action && model.action !== "reconnect"
      ? model.action === "resume"
        ? resumeAction
        : model.action === "retry"
          ? retryAction
          : pauseAction
      : null;
  const refresh = hideRefresh ? null : (
    <SearchInsightsRefresh active={model.semanticState === "running"} />
  );
  return (
    <div
      className={`${NOTE} flex w-full items-center justify-between`}
      data-testid="search-import-line"
    >
      <SearchSyncStatusControl
        actionNode={
          action && model.action && model.action !== "reconnect" ? (
            <SearchImportPauseControl action={action} intent={model.action} projectId={projectId} />
          ) : undefined
        }
        leadingActionNode={refresh}
        model={model}
        reconnectHref={reconnectHref}
      />
    </div>
  );
}
const unavailablePauseAction: SearchInsightsImportAction = async () => ({
  message: "Search data sync action is unavailable.",
  ok: false,
});

export function SearchInsightsTrustStrip({
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
  retryAction,
  workerStatus,
}: Readonly<SearchInsightsTrustStripProps>) {
  if (!providerAvailableThrough) {
    if (!localViewReady) return null;
    return (
      <SearchInsightsWaitingStrip
        deploymentMode={deploymentMode}
        importState={importState}
        pauseAction={pauseAction}
        projectId={projectId}
        resumeAction={resumeAction}
        workerStatus={workerStatus}
      />
    );
  }

  return (
    <section aria-label="Data provenance" className="grid grid-cols-1 bg-bg-elev xl:grid-cols-3">
      <Cell label={TRUST_LABELS.freshness} trailing={<IncidentPill incidents={incidents} />}>
        <span className={FACT}>
          {providerAvailabilitySource === "metadata"
            ? "Google data available through "
            : "Estimated Google data availability through "}
          <EmphasizedDate compact value={providerAvailableThrough} />
        </span>
        {!localViewReady ? (
          <span className={NOTE} data-testid="local-first-view-progress">
            {importState?.completedDays ?? 0} of 28 days imported for the first view
          </span>
        ) : null}
        <span className={NOTE}>{freshnessNote(importState?.lastProbeAt ?? null)}</span>
      </Cell>
      <Cell divided label={TRUST_LABELS.coverage}>
        {coverage.calculable ? (
          <>
            <span className={FACT}>
              Query text on <strong className={VALUE}>{coverage.clicksShare}%</strong> of clicks ·{" "}
              <strong className={VALUE}>{coverage.impressionsShare}%</strong> of impressions
              {capHitClause(coverage.capHitDays)}
            </span>
            <span className={NOTE}>{COVERAGE_NOTE}</span>
          </>
        ) : (
          <span className={FACT}>{COVERAGE_EMPTY}</span>
        )}
      </Cell>
      <Cell divided label={TRUST_LABELS.retention}>
        <span className={FACT}>
          {retentionOwnershipCopy(importState?.plannedRetentionMonths ?? 16, deploymentMode)}
        </span>
      </Cell>
      {localViewReady ? (
        <div className="col-span-full border-t border-border px-4 py-2.5">
          <ImportLine
            importState={importState}
            pauseAction={pauseAction}
            projectId={projectId}
            resumeAction={resumeAction}
            retryAction={retryAction}
          />
        </div>
      ) : null}
    </section>
  );
}
