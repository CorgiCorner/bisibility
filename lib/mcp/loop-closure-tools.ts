import type { ApiOperationId } from "@/lib/api/operation-policy";
import { operationPath } from "./operation-path";
import { requiredString } from "./tool-arguments";
import type { JsonObject } from "./types";

type RestCall = {
  body?: unknown;
  idempotencyKey?: string;
  method: "GET" | "PATCH" | "POST";
  path: string;
  projectId?: string;
};

function call(input: JsonObject, path: string, method: RestCall["method"], body?: unknown) {
  return {
    body,
    idempotencyKey: input.idempotency_key as string | undefined,
    method,
    path,
    projectId: typeof input.project_id === "string" ? input.project_id : undefined,
  };
}

function exportQuery(input: JsonObject) {
  const params = new URLSearchParams({ format: "json" });
  for (const key of [
    "cursor",
    "granularity",
    "limit",
    "range",
    "version",
    "stream",
    "basis",
    "from",
    "to",
    "aggregation",
  ]) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "number") params.set(key, String(value));
  }
  if (Array.isArray(input.keyword_ids)) {
    for (const value of input.keyword_ids) {
      if (typeof value === "string" && value) params.append("keyword_id", value);
    }
  }
  return `?${params}`;
}

export function dispatchLoopClosureTool(name: string, input: JsonObject): RestCall | null {
  const path = (operation: ApiOperationId) => operationPath(operation, input);
  if (name === "markProjectAlertsRead") return call(input, path("markProjectAlertsRead"), "POST");
  if (name === "muteTriggeredAlert") return call(input, path("muteTriggeredAlert"), "POST");
  if (name === "exportRankHistory")
    return call(input, `${path("exportRankHistory")}${exportQuery(input)}`, "GET");
  if (name === "listSitemapMonitors") return call(input, path("listSitemapMonitors"), "GET");
  if (name === "enableSitemapMonitor" || name === "disableSitemapMonitor") {
    // A project has exactly one sitemap monitor and its id equals the project id, so the
    // monitor_id argument is optional and defaults to project_id.
    const monitorId =
      typeof input.monitor_id === "string" && input.monitor_id.trim()
        ? encodeURIComponent(requiredString(input, "monitor_id"))
        : encodeURIComponent(requiredString(input, "project_id"));
    return call(input, `${path("listSitemapMonitors")}/${monitorId}`, "PATCH", {
      enabled: name === "enableSitemapMonitor",
    });
  }
  return null;
}
