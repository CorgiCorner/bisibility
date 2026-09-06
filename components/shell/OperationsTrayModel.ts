import type { ClientDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import {
  type OperationRowProps,
  runStatusChipPresentation,
  type StatusChipTone,
} from "@/components/ui";
import {
  pauseSearchInsightsImport,
  resumeSearchInsightsImport,
  retrySearchInsightsImport,
} from "@/lib/actions/search-insights";
import { pluralize } from "@/lib/format/pluralize";
import { blockedRunPresentation } from "@/lib/rank-check/runs/blocked-presentation";
import type {
  GscImportOperation,
  OperationSnapshot,
  RankCheckOperation,
} from "@/lib/rank-check/runs/contract";
import { selectionSummarySuffix } from "@/lib/rank-check/runs/selection-label";
import { type ProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { rankTrackerRunsPath } from "@/lib/routing/rank-tracker-runs-path";

export type TrayOperation = Pick<
  OperationRowProps,
  | "action"
  | "actor"
  | "completed"
  | "counts"
  | "deferred"
  | "etaSeconds"
  | "failed"
  | "href"
  | "meta"
  | "nextCheckAt"
  | "now"
  | "provider"
  | "resumeDate"
  | "showBar"
  | "state"
  | "stateLine"
  | "status"
  | "title"
  | "total"
  | "unit"
> & {
  attention: Extract<StatusChipTone, "attention" | "critical"> | null;
  blocked: boolean;
  id: string;
  kind: OperationSnapshot["kind"];
  lifecycle: "executing" | "terminal" | "waiting";
};

export type OperationsTrayPill =
  | { kind: "idle" }
  | {
      count: number;
      kind: "busy";
      tone: StatusChipTone;
      word: "blocked" | "failed" | "running" | "waiting";
    };

export function isTrayOperation(operation: OperationSnapshot) {
  return !(
    operation.kind === "rank_check" &&
    operation.status === "cancelled" &&
    operation.startedAt === null
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
    actor: null,
    attention,
    blocked: operation.status === "blocked",
    completed: operation.counts.completed,
    counts: null,
    deferred: operation.counts.deferred,
    etaSeconds: operation.etaSeconds ?? null,
    failed: operation.counts.failed,
    href: rankTrackerRunsPath(projectRef, operation.id),
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
  const stateMap: Record<
    string,
    Pick<TrayOperation, "action" | "attention" | "state" | "stateLine">
  > = {
    completed: { action: "", attention: null, state: "succeeded", stateLine: null },
    failed: { action: "retry", attention: "critical", state: "failed", stateLine: null },
    paused: {
      action: "resume",
      attention: "attention",
      state: "worker",
      stateLine: "The import is paused. Resume it to continue importing finalized search data.",
    },
    queued: { action: "pause", attention: null, state: "worker", stateLine: null },
    running: { action: "pause", attention: null, state: "worker", stateLine: null },
    waiting_for_first_data: {
      action: "pause",
      attention: "attention",
      state: "worker",
      stateLine:
        "Google has not reported any search data for this property yet. We check daily and will import automatically when it appears.",
    },
  };
  const mapped = stateMap[operation.state] ?? {
    action: "" as const,
    attention: "attention" as const,
    state: "worker" as const,
    stateLine: "Waiting for the import worker to pick this up - it polls every 60 seconds.",
  };

  return {
    ...mapped,
    actor: null,
    blocked: false,
    completed: operation.progress.done,
    counts: null,
    deferred: 0,
    etaSeconds: null,
    failed: 0,
    href: searchConsolePath(projectRef),
    id: operation.id,
    kind: operation.kind,
    lifecycle:
      operation.state === "running"
        ? "executing"
        : operation.state === "queued"
          ? "waiting"
          : "terminal",
    meta: "",
    nextCheckAt: null,
    now: null,
    provider: null,
    resumeDate: null,
    showBar: true,
    status: null,
    title: "Search Console import",
    total: operation.progress.total,
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

export function labelForPill(operations: readonly TrayOperation[]): OperationsTrayPill {
  const attention = operations.filter((operation) => operation.attention !== null);
  if (operations.length === 0) {
    return { kind: "idle" };
  }
  if (attention.length === 0) {
    const executing = operations.filter((operation) => operation.lifecycle === "executing");
    if (executing.length > 0) {
      return { count: executing.length, kind: "busy", tone: "info", word: "running" };
    }
    const waiting = operations.filter((operation) => operation.lifecycle === "waiting");
    if (waiting.length > 0) {
      return { count: waiting.length, kind: "busy", tone: "info", word: "waiting" };
    }
    return { kind: "idle" };
  }
  const hasFailure = attention.some((operation) => operation.attention === "critical");
  return {
    count: attention.length,
    kind: "busy",
    tone: hasFailure ? "critical" : "attention",
    word: hasFailure
      ? "failed"
      : attention.every((operation) => operation.blocked)
        ? "blocked"
        : "waiting",
  };
}

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
  const input = { projectId: projectRef, transition: operation.action };
  const result =
    operation.action === "pause"
      ? await pauseSearchInsightsImport(input)
      : operation.action === "resume"
        ? await resumeSearchInsightsImport(input)
        : operation.action === "retry"
          ? await retrySearchInsightsImport(input)
          : { ok: true };
  if (!result.ok) {
    throw new Error("message" in result ? result.message : "Operation update failed.");
  }
}
