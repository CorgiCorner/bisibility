import type { RunOutcome, RunStatus } from "@/lib/rank-check/runs/contract";
import type { SearchSyncStatusTitle } from "@/lib/search-insights/sync/control-types";
import type {
  ProjectRun,
  ProjectRunAttention,
  ProjectRunGscImport,
  ProjectRunLifecycle,
} from "./project-run";

/** Every word a rank-check chip can show, in chip and filter-menu order. */
export const RANK_RUN_STATUS_KEYS = [
  "planned",
  "blocked",
  "queued",
  "running",
  "cancelling",
  "succeeded",
  "partial",
  "deferred",
  "skipped",
  "failed",
  "cancelled",
  "not_confirmed",
] as const;
export type RankRunStatusKey = (typeof RANK_RUN_STATUS_KEYS)[number];

/** One key per Search Console sync title, in chip and filter-menu order. */
export const GSC_RUN_STATUS_KEYS = [
  "queued",
  "importing",
  "paused",
  "waiting_for_google",
  "reconnect_required",
  "waiting_for_data",
  "delayed",
  "failed",
  "completed",
  "status_unavailable",
] as const;
export type GscRunStatusKey = (typeof GSC_RUN_STATUS_KEYS)[number];

export type RunStatusKey = RankRunStatusKey | GscRunStatusKey;
export const RUN_STATUS_KEYS: readonly RunStatusKey[] = [
  ...new Set<RunStatusKey>([...RANK_RUN_STATUS_KEYS, ...GSC_RUN_STATUS_KEYS]),
];

export function isRankRunStatusKey(value: string): value is RankRunStatusKey {
  return (RANK_RUN_STATUS_KEYS as readonly string[]).includes(value);
}

export function isGscRunStatusKey(value: string): value is GscRunStatusKey {
  return (GSC_RUN_STATUS_KEYS as readonly string[]).includes(value);
}

export function rankRunStatusKey(
  status: RunStatus,
  outcome: RunOutcome | null,
  reason?: string | null,
): RankRunStatusKey {
  if (status !== "completed") return status;
  if (reason === "no_active_keywords") return "skipped";
  return outcome ?? "not_confirmed";
}

const GSC_TITLE_KEYS = {
  Queued: "queued",
  Importing: "importing",
  Paused: "paused",
  "Waiting for Google": "waiting_for_google",
  "Reconnect required": "reconnect_required",
  "Waiting for data": "waiting_for_data",
  Delayed: "delayed",
  Failed: "failed",
  Completed: "completed",
  "Status unavailable": "status_unavailable",
  Complete: "completed",
  "Needs reauth": "reconnect_required",
  "Needs retry": "failed",
  "Paused by provider limits": "waiting_for_google",
  "Paused by you": "paused",
  Running: "importing",
  "Waiting on worker": "delayed",
} as const satisfies Record<SearchSyncStatusTitle, GscRunStatusKey>;

export function gscStatusKeyForTitle(title: SearchSyncStatusTitle): GscRunStatusKey {
  return GSC_TITLE_KEYS[title];
}

const GSC_PAUSED_ATTENTION_KEYS: Partial<Record<ProjectRunAttention["kind"], GscRunStatusKey>> = {
  failed: "failed",
  needs_reauthentication: "reconnect_required",
  paused: "paused",
};

/** Mirrors the titles the sync control model gives the same stored state and pause reason. */
export function gscLifecycleStatusKey(
  lifecycle: ProjectRunLifecycle,
  attention: ProjectRunAttention | null,
): GscRunStatusKey {
  switch (lifecycle) {
    case "queued":
      return "queued";
    case "running":
      return "importing";
    case "waiting_for_first_data":
      return "waiting_for_data";
    case "waiting_to_resume":
      return "waiting_for_google";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "paused":
      return (attention && GSC_PAUSED_ATTENTION_KEYS[attention.kind]) ?? "status_unavailable";
    case "status_unavailable":
      return attention?.kind === "worker_unavailable" ? "delayed" : "status_unavailable";
    default:
      return "status_unavailable";
  }
}

export type GscRunWithTitle = ProjectRunGscImport &
  Readonly<{ snapshotState?: SearchSyncStatusTitle }>;

export function gscRunStatusKey(run: GscRunWithTitle): GscRunStatusKey {
  return run.snapshotState
    ? gscStatusKeyForTitle(run.snapshotState)
    : gscLifecycleStatusKey(run.lifecycle, run.attention);
}

export function projectRunStatusKey(run: ProjectRun | GscRunWithTitle): RunStatusKey {
  return run.kind === "rank_check"
    ? rankRunStatusKey(run.details.status, run.details.outcome, run.details.blockedReason)
    : gscRunStatusKey(run);
}
