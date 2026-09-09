import type { PublicIdForPrefix } from "@/lib/db/public-id";
import type { RunOutcome, RunStatus, RunTrigger } from "@/lib/rank-check/runs/contract";
import type { ProjectRunCapabilities, ProjectRunKind, ProjectRunProgress } from "./contracts";
import type { ProjectRunsPlannedSortTuple, ProjectRunsSortTuple } from "./cursor";

export type ProjectRunProject = Readonly<{
  name: string;
  publicId: PublicIdForPrefix<"prj">;
}>;

export type ProjectRunScope = Readonly<{
  description: string | null;
  label: string;
}>;

export type ProjectRunLifecycle =
  | "planned"
  | "blocked"
  | "queued"
  | "running"
  | "cancelling"
  | "waiting_for_first_data"
  | "waiting_to_resume"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed"
  | "status_unavailable";

export type ProjectRunAttention = Readonly<{
  kind: "blocked" | "failed" | "needs_reauthentication" | "paused" | "worker_unavailable";
  message: string | null;
}>;

export type ProjectRunRankCheckTimestamps = Readonly<{
  createdAt: string;
  finishedAt: string | null;
  launchedAt: string | null;
  plannedFor: string | null;
  startedAt: string | null;
}>;

export type ProjectRunGscImportTimestamps = Readonly<{
  createdAt: string;
  lastProbeAt: string | null;
  lastSyncFinishedAt: string | null;
  lastSyncStartedAt: string | null;
  syncStartedAt: string | null;
}>;

export type ProjectRunRankCheckDetails = Readonly<{
  costCents: number | null;
  estimatedCostCents: number | null;
  outcome: RunOutcome | null;
  status: RunStatus;
  trigger: RunTrigger;
}>;

export const PROJECT_RUN_GSC_IMPORT_KNOWN_STATES = [
  "queued",
  "running",
  "waiting_for_first_data",
  "paused",
  "completed",
  "failed",
] as const;

export type ProjectRunGscImportKnownState = (typeof PROJECT_RUN_GSC_IMPORT_KNOWN_STATES)[number];

export function isKnownProjectRunGscImportState(
  state: string,
): state is ProjectRunGscImportKnownState {
  return (PROJECT_RUN_GSC_IMPORT_KNOWN_STATES as readonly string[]).includes(state);
}

export type ProjectRunGscImportDetails = Readonly<{
  pausedReason: "error" | "needs_reauth" | "rate_limited" | "user" | null;
  property: string;
  source: "gsc";
  state: string;
}>;

type ProjectRunBase<
  Kind extends ProjectRunKind,
  Progress extends ProjectRunProgress,
  Timestamps,
  Details,
> = Readonly<{
  attention: ProjectRunAttention | null;
  capabilities: ProjectRunCapabilities;
  details: Details;
  href: string;
  id: string;
  kind: Kind;
  lifecycle: ProjectRunLifecycle;
  progress: Progress;
  project: ProjectRunProject;
  scope: ProjectRunScope;
  timestamps: Timestamps;
  title: string;
}>;

export type ProjectRunRankCheck = ProjectRunBase<
  "rank_check",
  ProjectRunProgress<"targets">,
  ProjectRunRankCheckTimestamps,
  ProjectRunRankCheckDetails
> &
  Readonly<{ id: PublicIdForPrefix<"rcr"> }>;

export type ProjectRunGscImport = ProjectRunBase<
  "gsc_import",
  ProjectRunProgress<"days">,
  ProjectRunGscImportTimestamps,
  ProjectRunGscImportDetails
>;

export type ProjectRun = ProjectRunRankCheck | ProjectRunGscImport;

/** Planned is rank-only and deliberately separate from attention and finished predicates. */
export function isPlannedProjectRun(run: ProjectRun): run is ProjectRunRankCheck {
  return (
    run.kind === "rank_check" &&
    run.timestamps.launchedAt === null &&
    (run.details.status === "planned" || run.details.status === "blocked")
  );
}

export function projectRunSortTuple(run: ProjectRun): ProjectRunsSortTuple {
  if (run.kind === "gsc_import") {
    return { id: run.id, kind: run.kind, sortAt: run.timestamps.createdAt };
  }

  const sortAt =
    run.timestamps.launchedAt ??
    run.timestamps.finishedAt ??
    (isPlannedProjectRun(run) ? run.timestamps.createdAt : null);
  if (!sortAt) {
    throw new Error("A rank-check run needs a launch or finish timestamp for the Runs sort.");
  }
  return { id: run.id, kind: run.kind, sortAt };
}

export function projectRunPlannedSortTuple(run: ProjectRun): ProjectRunsPlannedSortTuple {
  if (!isPlannedProjectRun(run) || !run.timestamps.plannedFor) {
    throw new Error("A planned rank-check run needs plannedFor for the planned Runs sort.");
  }
  return { id: run.id, kind: run.kind, plannedFor: run.timestamps.plannedFor };
}
