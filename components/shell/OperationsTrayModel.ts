import type { ClientDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { runStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import {
  pauseSearchInsightsImport,
  resumeSearchInsightsImport,
  retrySearchInsightsImport,
} from "@/lib/actions/search-insights";
import { pluralize } from "@/lib/format/pluralize";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { blockedRunPresentation } from "@/lib/rank-check/runs/blocked-presentation";
import type {
  GscImportOperation,
  OperationSnapshot,
  RankCheckOperation,
} from "@/lib/rank-check/runs/contract";
import { selectionSummarySuffix } from "@/lib/rank-check/runs/selection-label";
import { type ProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { projectRunRankCheckPath } from "@/lib/routing/project-runs-path";
import type { TrayOperation } from "./OperationsTrayModel.types";

export type { OperationsTrayPill, TrayOperation } from "./OperationsTrayModel.types";

export function isTrayOperation(operation: OperationSnapshot) {
  return !(
    (operation.kind === "rank_check" &&
      operation.status === "cancelled" &&
      operation.startedAt === null) ||
    (operation.kind === "gsc_import" &&
      (operation.presentation.title === "Completed" || operation.presentation.title === "Failed"))
  );
}

function rankCheckMeta(operation: RankCheckOperation): string {
  const keywords = pluralize(operation.keywordCount, "keyword");
  return operation.selectionKind === "single" || operation.trigger === "scheduled"
    ? keywords
    : `${keywords} ${selectionSummarySuffix(operation.selectionKind)}`;
}

function rankCheckPresentation(
  operation: RankCheckOperation,
  projectRef: ProjectRef,
  deploymentMode: ClientDeploymentMode,
): TrayOperation {
  const status = runStatusChipPresentation(operation.status, operation.outcome);
  // Older snapshots omit target activity, but an announced next check always means waiting.
  const running =
    operation.status === "running" &&
    operation.hasRunningTargets !== false &&
    operation.nextCheckAt === null;
  const cancellingWithActiveTarget =
    operation.status === "cancelling" && operation.hasRunningTargets === true;
  const state =
    operation.status === "completed"
      ? operation.outcome === "partial"
        ? "partial"
        : operation.outcome === "failed"
          ? "failed"
          : operation.outcome === "deferred"
            ? "deferred"
            : operation.outcome === "succeeded"
              ? "succeeded"
              : "not_confirmed"
      : operation.status === "cancelled"
        ? "cancelled"
        : operation.status === "blocked"
          ? "budget"
          : operation.status === "planned"
            ? "queued"
            : operation.status;
  const attention = status.tone === "critical" || status.tone === "attention" ? status.tone : null;

  return {
    action: operation.status === "queued" || operation.status === "running" ? "cancel" : "",
    actionHref: null,
    actor: null,
    attention,
    blocked: operation.status === "blocked",
    completed: operation.counts.completed,
    counts: null,
    deferred: operation.counts.deferred,
    etaSeconds: operation.etaSeconds ?? null,
    failed: operation.counts.failed,
    href: projectRunRankCheckPath(projectRef, operation.id),
    id: operation.id,
    kind: operation.kind,
    lifecycle:
      running || cancellingWithActiveTarget
        ? "executing"
        : operation.status === "queued" ||
            operation.status === "planned" ||
            operation.status === "running" ||
            operation.status === "cancelling"
          ? "waiting"
          : "terminal",
    meta: rankCheckMeta(operation),
    nextCheckAt: operation.nextCheckAt,
    now: operation.snapshotAt ?? null,
    provider: operation.providerLabel ?? null,
    property: null,
    resumeDate: null,
    showBar: true,
    state,
    status,
    stateLine:
      operation.status === "blocked"
        ? blockedRunPresentation({
            budget: operation.budget,
            deploymentMode,
            reason: operation.blockedReason,
          }).compact
        : null,
    title:
      operation.trigger === "scheduled"
        ? "Scheduled run"
        : operation.trigger === "retry"
          ? "Retry run"
          : operation.trigger === "api"
            ? "API run"
            : "Manual run",
    total: operation.counts.total,
    unit: "targets",
  };
}

function gscImportPresentation(
  operation: GscImportOperation,
  projectRef: ProjectRef,
): TrayOperation {
  const searchConsoleHref = `${searchConsolePath(projectRef)}?${new URLSearchParams({
    property: operation.property,
  }).toString()}`;
  const canReconnect =
    operation.capabilities.pause || operation.capabilities.resume || operation.capabilities.retry;
  const reconnectHref =
    canReconnect &&
    operation.presentation.action === "reconnect" &&
    operation.presentation.title === "Reconnect required"
      ? googleInstallUrl({
          projectId: projectRef,
          property: operation.property,
          provider: "gsc",
          returnPath: searchConsoleHref,
        })
      : null;
  const transitionAction =
    operation.presentation.action === "pause" ||
    operation.presentation.action === "resume" ||
    operation.presentation.action === "retry"
      ? operation.presentation.action
      : null;
  const action = reconnectHref
    ? "reconnect"
    : transitionAction && operation.capabilities[transitionAction]
      ? transitionAction
      : "";
  const title = operation.presentation.title;
  const running = title === "Importing";
  const queued = title === "Queued";
  const terminal = title === "Completed" || title === "Failed";
  const attention = running || queued ? null : title === "Failed" ? "critical" : "attention";
  const state = running
    ? "running"
    : queued
      ? "queued"
      : title === "Completed"
        ? "succeeded"
        : title === "Failed"
          ? "failed"
          : "deferred";

  return {
    action,
    actionHref: reconnectHref,
    actor: null,
    attention,
    blocked: false,
    completed: operation.progress.done ?? 0,
    counts: null,
    deferred: 0,
    etaSeconds: null,
    failed: 0,
    href: searchConsoleHref,
    id: operation.id,
    kind: operation.kind,
    lifecycle: running ? "executing" : queued ? "waiting" : terminal ? "terminal" : "attention",
    meta: title,
    nextCheckAt: null,
    now: null,
    provider: null,
    property: operation.property,
    resumeDate: null,
    showBar:
      operation.progress.done !== null &&
      operation.progress.total !== null &&
      operation.progress.total > 0 &&
      (terminal || operation.progress.done < operation.progress.total),
    state,
    stateLine: operation.presentation.supportingText,
    status: null,
    title: "Search Console import",
    total: operation.progress.total ?? 0,
    unit: "days",
  };
}

export function operationPresentationFor(
  operation: OperationSnapshot,
  projectRef: ProjectRef,
  deploymentMode: ClientDeploymentMode = "cloud",
): TrayOperation {
  return operation.kind === "rank_check"
    ? rankCheckPresentation(operation, projectRef, deploymentMode)
    : gscImportPresentation(operation, projectRef);
}

export { labelForPill } from "./OperationsTrayPillModel";

export async function performOperationAction(
  operation: TrayOperation,
  projectRef: ProjectRef,
): Promise<void> {
  if (operation.action === "cancel") {
    const response = await fetch(
      `/api/rank-check-runs/${encodeURIComponent(operation.id)}/cancel`,
      {
        body: JSON.stringify({ projectId: projectRef }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) throw new Error("Rank check cancellation failed.");
    return;
  }
  if (operation.action === "reconnect") return;
  const exactInput = {
    importId: operation.id,
    projectId: projectRef,
    property: operation.property,
    transition: operation.action,
  };
  const result =
    operation.action === "pause"
      ? await pauseSearchInsightsImport(exactInput)
      : operation.action === "resume"
        ? await resumeSearchInsightsImport(exactInput)
        : operation.action === "retry"
          ? await retrySearchInsightsImport(exactInput)
          : { ok: true };
  if (!result.ok) {
    throw new Error("message" in result ? result.message : "Operation update failed.");
  }
}
