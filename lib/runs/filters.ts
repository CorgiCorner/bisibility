import { z } from "zod";

export const PROJECT_RUNS_VIEWS = ["runs", "planned"] as const;
export const PROJECT_RUNS_SOURCES = ["all", "rank_checks", "search_console"] as const;
export const PROJECT_RUNS_STATUSES = ["all", "active", "attention", "finished"] as const;

export const projectRunsViewSchema = z.enum(PROJECT_RUNS_VIEWS);
export const projectRunsSourceSchema = z.enum(PROJECT_RUNS_SOURCES);
export const projectRunsStatusSchema = z.enum(PROJECT_RUNS_STATUSES);

export type ProjectRunsView = z.infer<typeof projectRunsViewSchema>;
export type ProjectRunsSource = z.infer<typeof projectRunsSourceSchema>;
export type ProjectRunsStatus = z.infer<typeof projectRunsStatusSchema>;

export const PROJECT_RUNS_DEFAULT_LIMIT = 20;
export const PROJECT_RUNS_MAX_LIMIT = 100;

export const projectRunsFiltersSchema = z
  .object({
    source: projectRunsSourceSchema,
    status: projectRunsStatusSchema,
    view: projectRunsViewSchema,
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
  view: "runs",
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
  return left.source === right.source && left.status === right.status && left.view === right.view;
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
