import { z } from "zod";
import { RUN_STATUS_KEYS } from "./run-status-vocabulary";

export const PROJECT_RUNS_VIEWS = ["timeline", "runs", "planned"] as const;
export const PROJECT_RUNS_SECTIONS = ["all", "active", "upcoming", "history"] as const;
export const PROJECT_RUNS_ORDERS = ["default", "asc", "desc"] as const;
export const PROJECT_RUNS_SOURCES = ["all", "rank_checks", "search_console"] as const;
/** Group values predate per-chip statuses and stay valid for URLs and `GET /api/runs`. */
export const PROJECT_RUNS_STATUS_GROUPS = ["all", "active", "attention", "finished"] as const;
export const PROJECT_RUNS_STATUSES = [...PROJECT_RUNS_STATUS_GROUPS, ...RUN_STATUS_KEYS] as const;

export const projectRunsViewSchema = z.enum(PROJECT_RUNS_VIEWS);
export const projectRunsSourceSchema = z.enum(PROJECT_RUNS_SOURCES);
export const projectRunsStatusSchema = z.enum(PROJECT_RUNS_STATUSES);

export type ProjectRunsView = z.infer<typeof projectRunsViewSchema>;
export type ProjectRunsSource = z.infer<typeof projectRunsSourceSchema>;
export type ProjectRunsStatus = z.infer<typeof projectRunsStatusSchema>;
export type ProjectRunsStatusGroup = (typeof PROJECT_RUNS_STATUS_GROUPS)[number];

export function isProjectRunsStatusGroup(status: string): status is ProjectRunsStatusGroup {
  return (PROJECT_RUNS_STATUS_GROUPS as readonly string[]).includes(status);
}

export const PROJECT_RUNS_DEFAULT_LIMIT = 20;
export const PROJECT_RUNS_MAX_LIMIT = 100;

export const projectRunsFiltersSchema = z
  .object({
    source: projectRunsSourceSchema,
    status: projectRunsStatusSchema,
    view: projectRunsViewSchema,
    section: z.enum(PROJECT_RUNS_SECTIONS).optional(),
    order: z.enum(PROJECT_RUNS_ORDERS).optional(),
  })
  .strict();

export type ProjectRunsFilters = z.infer<typeof projectRunsFiltersSchema>;

export const projectRunsQuerySchema = projectRunsFiltersSchema
  .extend({
    cursor: z.string().min(1).max(2_048).nullable(),
    limit: z.number().int().min(1).max(PROJECT_RUNS_MAX_LIMIT),
  })
  .strict();

export type ProjectRunsQuery = z.infer<typeof projectRunsQuerySchema>;

export const PROJECT_RUNS_DEFAULT_FILTERS: ProjectRunsFilters = {
  source: "all",
  status: "all",
  view: "timeline",
};

export const PROJECT_RUNS_DEFAULT_QUERY: ProjectRunsQuery = {
  ...PROJECT_RUNS_DEFAULT_FILTERS,
  cursor: null,
  limit: PROJECT_RUNS_DEFAULT_LIMIT,
};

const rawProjectRunsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2_048).optional(),
    limit: z.coerce.number().int().min(1).max(PROJECT_RUNS_MAX_LIMIT).optional(),
    source: projectRunsSourceSchema.optional(),
    status: projectRunsStatusSchema.optional(),
    view: projectRunsViewSchema.optional(),
    section: z.enum(PROJECT_RUNS_SECTIONS).optional(),
    order: z.enum(PROJECT_RUNS_ORDERS).optional(),
  })
  .strict();

function queryValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) ?? undefined;
}

export function parseProjectRunsQuery(searchParams: URLSearchParams): ProjectRunsQuery {
  const raw = rawProjectRunsQuerySchema.parse({
    cursor: queryValue(searchParams, "cursor"),
    limit: queryValue(searchParams, "limit"),
    source: queryValue(searchParams, "source"),
    status: queryValue(searchParams, "status"),
    view: queryValue(searchParams, "view"),
    section: queryValue(searchParams, "section"),
    order: queryValue(searchParams, "order"),
  });
  const definedQuery = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined),
  );
  return projectRunsQuerySchema.parse({
    ...PROJECT_RUNS_DEFAULT_QUERY,
    ...definedQuery,
    cursor: raw.cursor ?? null,
  });
}

export function sameProjectRunsFilters(left: ProjectRunsFilters, right: ProjectRunsFilters) {
  return (
    left.source === right.source &&
    left.status === right.status &&
    left.view === right.view &&
    (left.section ?? "all") === (right.section ?? "all") &&
    (left.order ?? "default") === (right.order ?? "default")
  );
}

export function updateProjectRunsQuery(
  current: ProjectRunsQuery,
  updates: Partial<ProjectRunsQuery>,
): ProjectRunsQuery {
  const currentQuery = projectRunsQuerySchema.parse(current);
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  );
  const next = projectRunsQuerySchema.parse({ ...currentQuery, ...definedUpdates });

  return sameProjectRunsFilters(currentQuery, next) ? next : { ...next, cursor: null };
}
