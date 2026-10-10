import {
  isProjectRunsStatusGroup,
  type ProjectRunsQuery,
  type ProjectRunsSource,
  type ProjectRunsStatus,
  projectRunsSourceSchema,
  projectRunsStatusSchema,
} from "@/lib/runs/filters";
import { isGscRunStatusKey, isRankRunStatusKey } from "@/lib/runs/run-status-vocabulary";
import type { RunStatusSource } from "./run-status-copy";

// Menu values carry the source because queued, failed and cancelled exist in both groups.
export function statusMenuValue(source: RunStatusSource, status: string) {
  return `${source}:${status}`;
}

/** Group values are no longer menu options, so they resolve to no option. */
export function statusMenuValueFor(query: Pick<ProjectRunsQuery, "source" | "status">) {
  if (isProjectRunsStatusGroup(query.status)) return query.status;
  if (query.source !== "all") return statusMenuValue(query.source, query.status);
  return statusMenuValue(
    isRankRunStatusKey(query.status) ? "rank_checks" : "search_console",
    query.status,
  );
}

export function statusMenuSelection(
  value: string,
): Partial<Pick<ProjectRunsQuery, "source" | "status">> {
  if (isProjectRunsStatusGroup(value)) return { status: value };
  const [source, status] = value.split(":");
  return {
    source: projectRunsSourceSchema.parse(source),
    status: projectRunsStatusSchema.parse(status),
  };
}

export function statusSurvivesSource(status: ProjectRunsStatus, source: ProjectRunsSource) {
  if (isProjectRunsStatusGroup(status) || source === "all") return true;
  return source === "rank_checks" ? isRankRunStatusKey(status) : isGscRunStatusKey(status);
}
