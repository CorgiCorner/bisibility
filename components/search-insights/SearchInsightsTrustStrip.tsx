"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import type { DataIncident } from "@/lib/search-insights/constants";
import { formatDateLabel } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsCoverage } from "@/lib/search-insights/queries/coverage";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import {
  resolveSearchSyncControl,
  type SearchSyncControlFacts,
} from "@/lib/search-insights/sync/control-model";
import type { ReactNode } from "react";
import { SearchInsightsRefresh } from "./SearchInsightsRefresh";
import { SearchInsightsWaitingStrip } from "./SearchInsightsWaitingStrip";
import { SearchSyncStatusControl } from "./SearchSyncStatusControl";
import {
  COVERAGE_NOTE,
  COVERAGE_PENDING_FIRST_DAYS,
  COVERAGE_PENDING_WINDOW,
  INCIDENT_PILL,
  retentionOwnershipCopy,
  TRUST_LABELS,
} from "./search-insights-copy";
import {
  capHitClause,
  freshnessPresentation,
  importObservabilityProgress,
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
  statusFacts?: SearchSyncControlFacts;
  workerStatus: WorkerTemporalStatus;
};
const CELL = "flex flex-col gap-1.5 px-4 py-3";
const LABEL = "font-sans tabular-nums text-ui-micro uppercase tracking-wide text-fg-muted";
const FACT = "text-ui-body text-fg";
const VALUE = "font-sans tabular-nums font-semibold";
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
  const dateFormat = useDateFormat();
  const label = formatDateLabel(value, dateFormat);
  const comma = label.lastIndexOf(",");
  const day = comma === -1 ? label : label.slice(0, comma);
  const year = comma === -1 ? "" : label.slice(comma + 1).trim();
  const showYear = !compact && year.length > 0;
  return (
    <strong className="font-semibold" data-testid="provider-available-date">
      <span className="font-sans tabular-nums">{day}</span>
      {showYear ? <span>, </span> : null}
      {showYear ? <span className="font-sans tabular-nums">{year}</span> : null}
    </strong>
  );
}
function IncidentPill({ incidents }: Readonly<{ incidents: readonly DataIncident[] }>) {
  if (incidents.length === 0) return null;
  return (
    <Tooltip content={incidentTooltip(incidents)}>
      <span className="cursor-help rounded-full bg-bg-inset px-2 py-0.5 font-sans tabular-nums text-ui-micro text-fg-muted">
        {INCIDENT_PILL}
      </span>
    </Tooltip>
  );
}
function ImportLine({
  hideRefresh = false,
  facts,
  importState,
  projectId = "",
  statusFacts,
}: Readonly<{
  hideRefresh?: boolean;
  facts: ImportObservabilityFacts | null;
  importState: SearchInsightsImportState | null;
  pauseAction?: SearchInsightsImportAction;
  projectId?: string;
  resumeAction?: SearchInsightsImportAction;
  retryAction?: SearchInsightsImportAction;
  statusFacts: SearchSyncControlFacts;
}>) {
  const dateFormat = useDateFormat();
  const progress = importProgress(importState, facts);
  if (progress.state === "none") return null;
  const model = resolveSearchSyncControl(statusFacts, dateFormat);
  const displayModel =
    model.action === "reconnect" ? model : { ...model, action: null, actionLabel: null };
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
        leadingActionNode={refresh}
        model={displayModel}
        reconnectHref={reconnectHref}
      />
    </div>
  );
}
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
  statusFacts,
  workerStatus,
}: Readonly<SearchInsightsTrustStripProps>) {
  const dateFormat = useDateFormat();
  const facts = importState?.facts ?? statusFacts?.observability ?? null;
  const progress = importObservabilityProgress(facts, new Date(), dateFormat);
  const freshness =
    progress?.freshness ??
    freshnessPresentation(
      facts?.lastProbeAt ?? importState?.lastProbeAt ?? null,
      new Date(),
      dateFormat,
    );
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
      aria-label="Data provenance"
      className="grid grid-cols-1 border-t border-border bg-bg-elev xl:grid-cols-3"
    >
      <Cell label={TRUST_LABELS.freshness} trailing={<IncidentPill incidents={incidents} />}>
        <span className={FACT}>
          {providerAvailabilitySource === "metadata"
            ? "Final through "
            : "Estimated final through "}
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
          <span className={FACT}>
            {(facts?.qualifyingDays ?? 0) > 0
              ? COVERAGE_PENDING_WINDOW
              : COVERAGE_PENDING_FIRST_DAYS}
          </span>
        )}
      </Cell>
      <Cell divided label={TRUST_LABELS.retention}>
        <span className={FACT}>
          {retentionOwnershipCopy(importState?.plannedRetentionMonths ?? 16, deploymentMode)}
        </span>
        {progress ? (
          <span className={NOTE} data-testid="deep-history-progress">
            {progress.deepHistory}
          </span>
        ) : null}
      </Cell>
      {localViewReady && statusFacts ? (
        <div className="col-span-full border-t border-border px-4 py-2.5">
          <ImportLine
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
