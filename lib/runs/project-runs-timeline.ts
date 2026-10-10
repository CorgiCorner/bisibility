import type { ProjectRunsTimelineSortTuple } from "./cursor";
import type { ProjectRunsQuery } from "./filters";
import type { ProjectRun } from "./project-run";

export function projectRunTimelineGroup(run: ProjectRun): 0 | 1 | 2 {
  if (run.kind === "rank_check") {
    if (["completed", "cancelled"].includes(run.details.status)) return 2;
    return ["running", "cancelling"].includes(run.details.status) ||
      (run.details.status === "blocked" && run.timestamps.startedAt)
      ? 0
      : 1;
  }
  if (["completed", "failed"].includes(run.details.state)) return 2;
  return run.lifecycle === "queued" ? 1 : 0;
}

export function projectRunTimelineAt(run: ProjectRun): string {
  const group = projectRunTimelineGroup(run);
  if (run.kind === "gsc_import") {
    return (
      (group === 2
        ? run.timestamps.lastSyncFinishedAt
        : group === 0
          ? (run.timestamps.syncStartedAt ?? run.timestamps.lastSyncStartedAt)
          : null) ?? run.timestamps.createdAt
    );
  }
  return (
    (group === 2
      ? (run.timestamps.finishedAt ?? run.timestamps.launchedAt)
      : group === 0
        ? (run.timestamps.startedAt ?? run.timestamps.launchedAt)
        : (run.timestamps.nextCheckAt ?? run.timestamps.plannedFor ?? run.timestamps.launchedAt)) ??
    run.timestamps.createdAt
  );
}

export function projectRunTimelineSortTuple(run: ProjectRun): ProjectRunsTimelineSortTuple {
  return {
    group: projectRunTimelineGroup(run),
    id: run.id,
    kind: run.kind,
    sortAt: projectRunTimelineAt(run),
  };
}

export function timelineAscending(group: number, order: ProjectRunsQuery["order"]) {
  return order === "asc" || (order !== "desc" && group !== 2);
}

export function compareTimelineTuples(
  left: ProjectRunsTimelineSortTuple,
  right: ProjectRunsTimelineSortTuple,
  order?: ProjectRunsQuery["order"],
) {
  if (left.group !== right.group) return left.group - right.group;
  const time = Date.parse(left.sortAt) - Date.parse(right.sortAt);
  if (time !== 0) return timelineAscending(left.group, order) ? time : -time;
  const a = `${left.kind}:${left.id}`;
  const b = `${right.kind}:${right.id}`;
  return a === b ? 0 : a < b ? -1 : 1;
}
