import type { getRankCheckRun, listRankCheckRuns } from "@/lib/queries/rank-check-runs";
import { isTerminalRunStatus } from "@/lib/rank-check/runs/status";
import { requireApiPublicId } from "./public-id";

type ReadRun =
  | Awaited<ReturnType<typeof getRankCheckRun>>
  | Awaited<ReturnType<typeof listRankCheckRuns>>["data"][number];
/** Finite public projection: no actor details, selection JSON, internal task IDs or billing metadata. */
export function publicRankCheckRun(run: ReadRun, projectId: string) {
  const terminal = isTerminalRunStatus(run.status);
  const pollingState = terminal
    ? "terminal"
    : run.status === "blocked"
      ? "blocked"
      : run.outcome === "deferred"
        ? "deferred"
        : ["planned", "queued", "running", "cancelling"].includes(run.status)
          ? "active"
          : "unknown";
  return {
    id: requireApiPublicId(run.id, "rcr"),
    project_id: requireApiPublicId(projectId, "prj"),
    status: run.status,
    outcome: run.outcome,
    terminal,
    polling_state: pollingState,
    trigger: run.trigger,
    counts: {
      requested: run.counts.requested,
      total: run.counts.total,
      completed: run.counts.completed,
      failed: run.counts.failed,
      deferred: run.counts.deferred,
      skipped: run.counts.skipped,
      cancelled: run.counts.cancelled,
    },
    counts_basis: run.launchedAt === null ? "planned_or_unlaunched" : "run_snapshot",
    keyword_count: run.keywordCount,
    target_count: run.targetCount,
    planned_for: run.plannedFor,
    launched_at: run.launchedAt,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    blocked_reason:
      run.blockedReason && /^[a-z0-9_.:-]{1,128}$/i.test(run.blockedReason)
        ? run.blockedReason
        : null,
    parent_run_id: run.parentRunId ? requireApiPublicId(run.parentRunId, "rcr") : null,
    cost_cents: run.costCents,
    usage: run.usage
      ? { actual: run.usage.actual, estimated: run.usage.estimated, unit: run.usage.unit }
      : null,
    native_estimate: run.nativeEstimate
      ? {
          provider_id: run.nativeEstimate.providerId,
          unit: run.nativeEstimate.unit,
          quantity: run.nativeEstimate.quantity,
          unknown_targets: run.nativeEstimate.unknownTargets,
        }
      : null,
  };
}
