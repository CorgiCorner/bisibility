import type { ApiOperationId } from "@/lib/api/operation-policy";
import { operationPath } from "./operation-path";
import { reviewedDefaultsRoute } from "./reviewed-defaults-route";

type ToolArgs = Record<string, unknown>;
type AgentRestCall = {
  body?: unknown;
  idempotencyKey?: string;
  method: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
  projectId?: string;
};

function query(input: ToolArgs, keys: string[]) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

function searchPerformanceQuery(input: ToolArgs) {
  const params = new URLSearchParams();
  for (const key of [
    "start_date",
    "end_date",
    "connection_id",
    "query",
    "limit",
    "query_match",
    "page_path",
    "page_path_match",
    "clicks_min",
    "impressions_min",
    "position_max",
    "country",
    "device",
    "offset",
  ]) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  if (Array.isArray(input.dimensions)) {
    params.set("dimensions", input.dimensions.join(","));
  }
  return params.size ? `?${params}` : "";
}

function trafficSnapshotQuery(input: ToolArgs) {
  const params = new URLSearchParams();
  for (const key of ["start_date", "end_date", "limit", "offset"]) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  if (Array.isArray(input.paths))
    for (const path of input.paths) if (typeof path === "string") params.append("path", path);
  return params.size ? `?${params}` : "";
}

function call(
  input: ToolArgs,
  path: string,
  method: AgentRestCall["method"],
  body?: unknown,
): AgentRestCall {
  return {
    body,
    idempotencyKey: input.idempotency_key as string | undefined,
    method,
    path,
    projectId: typeof input.project_id === "string" ? input.project_id : undefined,
  };
}

export function dispatchAgentToolRoute(name: string, input: ToolArgs): AgentRestCall | null {
  const path = (operation: ApiOperationId) => operationPath(operation, input);
  if (name === "updateProjectDefaults") return reviewedDefaultsRoute(input);
  if (name === "previewProjectDefaults")
    return reviewedDefaultsRoute({ ...input, preview_only: true });
  if (name === "searchLocations")
    return call(
      input,
      `${path("searchLocations")}${query(input, ["q", "country", "limit"])}`,
      "GET",
    );
  if (name === "listRankedKeywordSuggestions")
    return call(
      input,
      `${path("listRankedKeywordSuggestions")}${query(input, ["connection_id", "offset", "limit", "fresh", "max_cost_cents"])}`,
      "GET",
    );
  if (name === "listTrafficSnapshots")
    return call(input, `${path("listTrafficSnapshots")}${trafficSnapshotQuery(input)}`, "GET");
  if (name === "listSearchPerformanceQueryStats")
    return call(
      input,
      `${path("listSearchPerformanceQueryStats")}${searchPerformanceQuery(input)}`,
      "GET",
    );
  if (name === "listSearchIndexSitemaps")
    return call(input, path("listSearchIndexSitemaps"), "GET");
  if (name === "getSearchIndexSitemap") return call(input, path("getSearchIndexSitemap"), "GET");
  if (name === "inspectSearchIndexUrls")
    return call(input, path("inspectSearchIndexUrls"), "POST", { urls: input.urls });
  if (name === "getPageIndexingReport") return call(input, path("getPageIndexingReport"), "GET");
  if (name === "getPageIndexingSettings")
    return call(input, path("getPageIndexingSettings"), "GET");
  if (name === "listPageIndexingUrls")
    return call(
      input,
      `${path("listPageIndexingUrls")}${query(input, ["group", "coverage_state", "sitemap", "source", "search", "changed_since", "cursor", "limit", "history"])}`,
      "GET",
    );
  if (name === "updatePageIndexingSettings")
    return call(input, path("updatePageIndexingSettings"), "PATCH", {
      budget_mode: input.budget_mode,
      inspection_daily_limit: input.inspection_daily_limit,
    });
  if (name === "syncProjectTraffic") return call(input, path("syncProjectTraffic"), "POST");
  if (name === "resendTeamInvite") return call(input, path("resendTeamInvite"), "POST");
  if (name === "updateTeamMemberRole")
    return call(input, path("updateTeamMemberRole"), "PATCH", {
      role: input.role,
    });
  if (name === "removeTeamMember") return call(input, path("removeTeamMember"), "DELETE");
  return null;
}
