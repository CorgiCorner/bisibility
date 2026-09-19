import type { RestCall } from "./rest-call";
import type { JsonObject } from "./types";

function required(input: JsonObject, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return encodeURIComponent(value);
}

function query(input: JsonObject, keys: string[]) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.size ? `?${params}` : "";
}

function body(input: JsonObject, omit: string[]) {
  const skipped = new Set([...omit, "idempotency_key", "project_id"]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !skipped.has(key)));
}

function requireCostCap(input: JsonObject) {
  const value = input.max_cost_cents;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("max_cost_cents must be a nonnegative integer.");
  }
}

function call(
  input: JsonObject,
  path: string,
  method: RestCall["method"],
  bodyInput?: unknown,
): RestCall {
  return {
    body: bodyInput,
    idempotencyKey: input.idempotency_key as string | undefined,
    method,
    path,
    projectId: typeof input.project_id === "string" ? input.project_id : undefined,
  };
}

function project(input: JsonObject, resource = "") {
  const base = `/projects/${required(input, "project_id")}`;
  return resource ? `${base}/${resource}` : base;
}

function provider(input: JsonObject) {
  return `${project(input, "providers")}/${required(input, "provider_id")}`;
}

function estimateQuery(input: JsonObject, keys: string[]) {
  const params = new URLSearchParams({ estimate_only: "true" });
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return `?${params}`;
}

const storedReportQueryKeys: Record<string, string[]> = {
  backlinks: ["target", "target_scope", "mode", "include_subdomains"],
  domain_overview: ["target", "target_scope", "language_code", "location_code"],
  keyword_research: ["seed", "mode", "include_clickstream", "result_limit", "connection_id"],
};

function storedReportQuery(input: JsonObject, kind: string) {
  const keys = storedReportQueryKeys[kind];
  if (!keys) {
    throw new Error(`kind must be one of: ${Object.keys(storedReportQueryKeys).join(", ")}.`);
  }
  return query(input, keys);
}

export function dispatchExtendedToolRoute(name: string, input: JsonObject): RestCall | null {
  switch (name) {
    case "getCloudImportCompatibility":
      return call(input, "/cloud/import/compatibility", "GET");
    case "getProviderRates":
      return call(input, "/provider-rates", "GET");
    case "getCostEstimate":
      return call(
        input,
        `/cost-estimate${query(input, [
          "keywords",
          "devices",
          "locations",
          "depth",
          "frequency",
          "cron_expression",
          "provider",
          "option",
          "plan",
        ])}`,
        "GET",
      );
    case "updateProject":
      return call(input, project(input), "PATCH", body(input, ["project_id"]));
    case "deleteProject":
      return call(input, project(input), "DELETE");
    case "getProjectDefaults":
      return call(input, project(input, "defaults"), "GET");
    case "analyzeBacklinks":
      return call(
        input,
        `${project(input, "backlinks")}${query(input, [
          "target",
          "target_scope",
          "mode",
          "result_limit",
          "include_subdomains",
          "fresh",
          "estimate_only",
          "max_cost_cents",
        ])}`,
        "GET",
      );
    case "loadMoreBacklinkRows":
      return call(input, project(input, "backlinks/rows"), "POST", body(input, ["project_id"]));
    case "estimateBacklinksCost":
      return call(
        input,
        `${project(input, "backlinks")}${estimateQuery(input, [
          "target",
          "target_scope",
          "mode",
          "result_limit",
          "include_subdomains",
          "max_cost_cents",
        ])}`,
        "GET",
      );
    case "analyzeDomainOverview":
      requireCostCap(input);
      return call(
        input,
        project(input, "domain-overview/analyze"),
        "POST",
        body(input, ["project_id"]),
      );
    case "loadDomainOverviewHistory":
      return call(
        input,
        project(input, "domain-overview/history"),
        "POST",
        body(input, ["project_id"]),
      );
    case "loadDomainOverviewKeywords":
      return call(
        input,
        project(input, "domain-overview/keywords"),
        "POST",
        body(input, ["project_id"]),
      );
    case "loadDomainOverviewPages":
      return call(
        input,
        project(input, "domain-overview/pages"),
        "POST",
        body(input, ["project_id"]),
      );
    case "estimateDomainOverviewCost":
      return call(input, project(input, "domain-overview/analyze"), "POST", {
        ...body(input, ["project_id"]),
        estimate_only: true,
      });
    case "createSignal":
      return call(input, "/signals", "POST", body(input, ["project_id"]));
    case "listSignals":
      return call(
        input,
        `${project(input, "signals")}${query(input, [
          "cursor",
          "limit",
          "source",
          "type",
          "from",
          "to",
        ])}`,
        "GET",
      );
    case "listProjectApiKeys":
      return call(
        input,
        `${project(input, "api-keys")}${query(input, ["cursor", "limit"])}`,
        "GET",
      );
    case "createProjectApiKey":
      return call(input, project(input, "api-keys"), "POST", body(input, ["project_id"]));
    case "setProviderEnabled":
      return call(input, provider(input), "PATCH", { enabled: input.enabled });
    case "setProviderPriority":
      return call(input, provider(input), "PATCH", { priority: input.priority });
    case "setPrimaryProvider":
      return call(input, provider(input), "PATCH", { priority: 0 });
    case "listStoredReports":
      return call(input, project(input, "research/reports"), "GET");
    case "getStoredReport": {
      const kind = typeof input.kind === "string" ? input.kind : "";
      return call(
        input,
        `${project(input, "research/reports")}/${encodeURIComponent(kind)}${storedReportQuery(input, kind)}`,
        "GET",
      );
    }
    default:
      return null;
  }
}
