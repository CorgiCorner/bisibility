"use client";

import { Tooltip } from "@/components/ui";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { docsLinkProps } from "@/lib/site/site";
import { cn } from "@/lib/ui/cn";
import { InfoIcon as Info } from "@phosphor-icons/react";
import { SearchImportPauseControl } from "./SearchImportPauseControl";
import { SearchInsightsRefresh } from "./SearchInsightsRefresh";
import {
  IMPORT_PAUSED_LINE,
  IMPORT_WAITING_FOR_WORKER,
  IMPORT_WAITING_FOR_WORKER_TOOLTIP,
  importDoneCopy,
  importRunningOwnershipCopy,
  NEUTRAL_COPY,
  TRUST_LABELS,
  workerIdentityMismatchCopy,
} from "./search-insights-copy";
import {
  importObservabilityProgress,
  importProgress,
  importStartupPresentation,
  progressWidthClass,
} from "./search-insights-trust-model";

const LABEL = "font-sans tabular-nums text-ui-micro uppercase tracking-wide text-fg-muted";
const FACT = "text-ui-body text-fg";

function WorkerWaitingTooltip() {
  return (
    <>
      {IMPORT_WAITING_FOR_WORKER_TOOLTIP}{" "}
      <a
        className="underline"
        {...docsLinkProps("/docs/self-hosting/temporal#worker-startup-troubleshooting")}
      >
        Self-hosting guide.
      </a>
    </>
  );
}

const unavailableAction: SearchInsightsImportAction = async () => ({
  message: "Search data sync action is unavailable.",
  ok: false,
});

export function SearchInsightsWaitingStrip({
  deploymentMode,
  facts,
  importState,
  pauseAction = unavailableAction,
  projectId = "",
  resumeAction = unavailableAction,
  workerStatus,
}: Readonly<{
  deploymentMode: "cloud" | "self-host";
  facts: ImportObservabilityFacts | null;
  importState: SearchInsightsImportState | null;
  pauseAction?: SearchInsightsImportAction;
  projectId?: string;
  resumeAction?: SearchInsightsImportAction;
  workerStatus: WorkerTemporalStatus;
}>) {
  const selectorProgress = importObservabilityProgress(facts);
  const progress = importProgress(importState, facts);
  const userPaused = importState?.pausedReason === "user";
  const livenessStatus = typeof workerStatus === "string" ? workerStatus : workerStatus.status;
  const temporalIdentityComparison =
    typeof workerStatus === "string" ? null : workerStatus.temporalIdentityComparison;
  const namesMismatch = temporalIdentityComparison?.status === "mismatch";
  const waitingForStaleWorker = deploymentMode === "self-host" && livenessStatus === "stale";
  const waitingForWorker = !userPaused && (waitingForStaleWorker || namesMismatch);
  const mismatchCopy = workerIdentityMismatchCopy(
    deploymentMode,
    temporalIdentityComparison?.detail ?? null,
  );
  const paused = progress.state === "paused";
  const waitingForFirstData = progress.state === "waiting_for_first_data";
  const done = progress.state === "done";
  const presentation = importStartupPresentation(progress);
  const fact =
    namesMismatch && !userPaused
      ? mismatchCopy.line
      : waitingForWorker
        ? IMPORT_WAITING_FOR_WORKER
        : userPaused
          ? "Import paused · resumes only when you say so"
          : paused
            ? IMPORT_PAUSED_LINE
            : done
              ? importDoneCopy(importState?.plannedRetentionMonths ?? 16)
              : selectorProgress && presentation.state === "active"
                ? `Importing your Google history · ${selectorProgress.qualifyingCounter}`
                : presentation.fact;
  const detail =
    namesMismatch && !userPaused ? (
      mismatchCopy.detail
    ) : waitingForWorker ? (
      <WorkerWaitingTooltip />
    ) : userPaused ? (
      "Pausing longer than Google's 16-month window permanently loses the oldest unimported days."
    ) : paused ? (
      NEUTRAL_COPY.importPaused
    ) : waitingForFirstData ? null : (
      importRunningOwnershipCopy(importState?.plannedRetentionMonths ?? 16, deploymentMode)
    );
  const showActiveSegments = !waitingForWorker && !paused && !done && !waitingForFirstData;
  return (
    <section
      aria-label="Data provenance"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-bg-elev px-4 py-3"
    >
      <span className={LABEL}>{TRUST_LABELS.freshness}</span>
      {showActiveSegments && presentation.showProgress ? (
        <span
          className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-bg-inset"
          data-startup-segment="progress"
        >
          <span
            className={cn(
              "block h-full bg-fg-muted",
              progressWidthClass(selectorProgress?.percent ?? progress.percent),
            )}
          />
        </span>
      ) : null}
      <span className={FACT} data-startup-segment="fact">
        {fact}
      </span>
      {showActiveSegments && presentation.activity ? (
        <span className={FACT} data-startup-segment="activity">
          · {presentation.activity}
        </span>
      ) : null}
      {showActiveSegments && presentation.eta ? (
        <span className="text-fg-muted" data-startup-segment="eta">
          · {presentation.eta}
        </span>
      ) : null}
      {selectorProgress ? (
        <span className="text-fg-muted" data-startup-segment="deep-history">
          · {selectorProgress.deepHistory}
        </span>
      ) : null}
      {selectorProgress ? (
        <Tooltip content={selectorProgress.freshness.tooltip} semantics="description">
          <span className="text-fg-muted" data-startup-segment="freshness">
            · {selectorProgress.freshness.label}
          </span>
        </Tooltip>
      ) : null}
      {showActiveSegments && presentation.showHeartbeat ? <SearchInsightsRefresh active /> : null}
      {userPaused || (progress.state === "running" && !waitingForFirstData) ? (
        <SearchImportPauseControl
          action={userPaused ? resumeAction : pauseAction}
          intent={userPaused ? "resume" : "pause"}
          projectId={projectId}
        />
      ) : null}
      {detail ? (
        <Tooltip content={detail} semantics="description">
          <span className="inline-flex">
            <Info weight="regular" aria-hidden className="shrink-0 text-fg-muted" size={13} />
          </span>
        </Tooltip>
      ) : null}
    </section>
  );
}
