import {
  compareProjectRunsPlannedSortTuples,
  compareProjectRunsSortTuples,
  decodeProjectRunsCursor,
  encodeProjectRunsCursor,
  type ProjectRunsPlannedSortTuple,
  type ProjectRunsSortTuple,
} from "./cursor";
import type { ProjectRunsFilters, ProjectRunsQuery, ProjectRunsStatus } from "./filters";
import {
  isPlannedProjectRun,
  type ProjectRun,
  projectRunPlannedSortTuple,
  projectRunSortTuple,
} from "./project-run";

const RANK_FINISHED_STATUSES = ["completed", "cancelled"] as const;
const GSC_FINISHED_STATES = ["completed", "failed"] as const;

export type ProjectRunsPage = Readonly<{ data: ProjectRun[]; nextCursor: string | null }>;

function matchesStatus(run: ProjectRun, status: ProjectRunsStatus) {
  if (status === "all") return true;
  if (status === "attention") return run.attention !== null;
  if (status === "active") {
    return [
      "queued",
      "running",
      "cancelling",
      "waiting_for_first_data",
      "waiting_to_resume",
    ].includes(run.lifecycle);
  }
  return run.kind === "rank_check"
    ? (RANK_FINISHED_STATUSES as readonly string[]).includes(run.lifecycle)
    : (GSC_FINISHED_STATES as readonly string[]).includes(run.lifecycle);
}

export function matchesProjectRunsQuery(run: ProjectRun, query: ProjectRunsQuery) {
  if (query.source === "rank_checks" && run.kind !== "rank_check") return false;
  if (query.source === "search_console" && run.kind !== "gsc_import") return false;
  if (query.view === "planned") return isPlannedProjectRun(run) && matchesStatus(run, query.status);
  return matchesStatus(run, query.status);
}

function filtersFor(query: ProjectRunsQuery): ProjectRunsFilters {
  return { source: query.source, status: query.status, view: query.view };
}

function afterRunsCursor(run: ProjectRun, cursor: ProjectRunsSortTuple | null) {
  return !cursor || compareProjectRunsSortTuples(projectRunSortTuple(run), cursor) > 0;
}

function afterPlannedCursor(run: ProjectRun, cursor: ProjectRunsPlannedSortTuple | null) {
  return (
    !cursor || compareProjectRunsPlannedSortTuples(projectRunPlannedSortTuple(run), cursor) > 0
  );
}

function pageRuns(candidates: readonly ProjectRun[], query: ProjectRunsQuery): ProjectRunsPage {
  const filters = { ...filtersFor(query), view: "runs" } as const;
  const cursor = decodeProjectRunsCursor(query.cursor, filters);
  const matching = candidates.filter(
    (run) => matchesProjectRunsQuery(run, query) && afterRunsCursor(run, cursor),
  );
  const ordered = [...matching].sort((left, right) =>
    compareProjectRunsSortTuples(projectRunSortTuple(left), projectRunSortTuple(right)),
  );
  const data = ordered.slice(0, query.limit);
  const last = data.at(-1);
  return {
    data,
    nextCursor:
      ordered.length > query.limit && last
        ? encodeProjectRunsCursor({ filters, sort: projectRunSortTuple(last) })
        : null,
  };
}

function pagePlanned(candidates: readonly ProjectRun[], query: ProjectRunsQuery): ProjectRunsPage {
  const filters = { ...filtersFor(query), view: "planned" } as const;
  const cursor = decodeProjectRunsCursor(query.cursor, filters);
  const matching = candidates.filter(
    (run) => matchesProjectRunsQuery(run, query) && afterPlannedCursor(run, cursor),
  );
  const ordered = [...matching].sort((left, right) =>
    compareProjectRunsPlannedSortTuples(
      projectRunPlannedSortTuple(left),
      projectRunPlannedSortTuple(right),
    ),
  );
  const data = ordered.slice(0, query.limit);
  const last = data.at(-1);
  return {
    data,
    nextCursor:
      ordered.length > query.limit && last
        ? encodeProjectRunsCursor({ filters, sort: projectRunPlannedSortTuple(last) })
        : null,
  };
}

export function pageProjectRuns(
  candidates: readonly ProjectRun[],
  query: ProjectRunsQuery,
): ProjectRunsPage {
  return query.view === "planned" ? pagePlanned(candidates, query) : pageRuns(candidates, query);
}

export { filtersFor };
