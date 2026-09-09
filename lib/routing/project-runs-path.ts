import { isPublicIdOfType } from "@/lib/db/public-id";
import {
  PROJECT_RUNS_DEFAULT_QUERY,
  type ProjectRunsQuery,
  projectRunsQuerySchema,
} from "@/lib/runs/filters";
import { appPath, type ProjectRef } from "./app-path";

function normalizeProjectRunsQuery(query: Partial<ProjectRunsQuery> | undefined): ProjectRunsQuery {
  const definedQuery = Object.fromEntries(
    Object.entries(query ?? {}).filter(([, value]) => value !== undefined),
  );
  return projectRunsQuerySchema.parse({ ...PROJECT_RUNS_DEFAULT_QUERY, ...definedQuery });
}

export function projectRunsPath(projectRef: ProjectRef, query?: Partial<ProjectRunsQuery>): string {
  const normalized = normalizeProjectRunsQuery(query);
  const searchParams = new URLSearchParams();
  if (normalized.view !== PROJECT_RUNS_DEFAULT_QUERY.view)
    searchParams.set("view", normalized.view);
  if (normalized.source !== PROJECT_RUNS_DEFAULT_QUERY.source) {
    searchParams.set("source", normalized.source);
  }
  if (normalized.status !== PROJECT_RUNS_DEFAULT_QUERY.status) {
    searchParams.set("status", normalized.status);
  }
  if (normalized.limit !== PROJECT_RUNS_DEFAULT_QUERY.limit)
    searchParams.set("limit", String(normalized.limit));
  if (normalized.cursor) searchParams.set("cursor", normalized.cursor);

  const path = appPath(projectRef, "runs");
  const search = searchParams.toString();
  return search ? `${path}?${search}` : path;
}

export function projectRunRankCheckPath(projectRef: ProjectRef, publicId: string): string {
  if (!isPublicIdOfType(publicId, "rcr")) {
    throw new Error("projectRunRankCheckPath requires a strict rcr_ public ID.");
  }
  return appPath(projectRef, "runs", "rank-checks", publicId);
}
