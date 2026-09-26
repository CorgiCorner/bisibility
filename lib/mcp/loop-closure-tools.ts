import type { JsonObject } from "./types";

type RestCall = {
  body?: unknown;
  idempotencyKey?: string;
  method: "GET" | "PATCH" | "POST";
  path: string;
  projectId?: string;
};

function required(input: JsonObject, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return encodeURIComponent(value);
}

function call(input: JsonObject, path: string, method: RestCall["method"], body?: unknown) {
  return {
    body,
    idempotencyKey: input.idempotency_key as string | undefined,
    method,
    path,
    projectId: typeof input.project_id === "string" ? input.project_id : undefined,
  };
}

function project(input: JsonObject, resource: string) {
  return `/projects/${required(input, "project_id")}/${resource}`;
}

function exportQuery(input: JsonObject) {
  const params = new URLSearchParams({ format: "json" });
  for (const key of ["cursor", "granularity", "limit", "range"]) {
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
  if (name === "markProjectAlertsRead")
    return call(input, project(input, "triggered-alerts/mark-read"), "POST");
  if (name === "muteTriggeredAlert")
    return call(
      input,
      `${project(input, "triggered-alerts")}/${required(input, "alert_id")}/mute`,
      "POST",
    );
  if (name === "exportRankHistory")
    return call(input, `${project(input, "exports/rank-history")}${exportQuery(input)}`, "GET");
  if (name === "listSitemapMonitors") return call(input, project(input, "sitemap-monitors"), "GET");
  if (name === "enableSitemapMonitor" || name === "disableSitemapMonitor") {
    // A project has exactly one sitemap monitor and its id equals the project id, so the
    // monitor_id argument is optional and defaults to project_id.
    const monitorId =
      typeof input.monitor_id === "string" && input.monitor_id.trim()
        ? required(input, "monitor_id")
        : required(input, "project_id");
    return call(input, `${project(input, "sitemap-monitors")}/${monitorId}`, "PATCH", {
      enabled: name === "enableSitemapMonitor",
    });
  }
  return null;
}
