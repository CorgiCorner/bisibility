import type { ApiOperationId } from "@/lib/api/operation-policy";
import { operationPath } from "./operation-path";
import type { RestCall } from "./rest-call";
import type { JsonObject } from "./types";

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

/**
 * Build the request body for connect_provider and update_provider_settings,
 * translating the deprecated `primary` compatibility alias into `priority`
 * before the API drops the unknown field. `primary: true` promotes priority 0
 * (unless the caller already set an explicit priority); `primary: false` is a
 * legacy no-op and never writes priority on its own.
 */
export function providerSettingsBody(input: JsonObject) {
  const base = body(input, ["project_id", "provider_id", "primary"]);
  if (input.primary === true && base.priority === undefined) base.priority = 0;
  return base;
}

export function dispatchExtendedToolRoute(name: string, input: JsonObject): RestCall | null {
  const path = (operation: ApiOperationId) => operationPath(operation, input);
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
      return call(input, path("updateProject"), "PATCH", body(input, ["project_id"]));
    case "deleteProject":
      return call(input, path("deleteProject"), "DELETE");
    case "getProjectDefaults":
      return call(input, path("getProjectDefaults"), "GET");
    case "analyzeBacklinks":
      return call(
        input,
        `${path("analyzeBacklinks")}${query(input, [
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
      if (
        typeof input.snapshot_ref !== "string" ||
        !input.snapshot_ref.length ||
        input.snapshot_ref.length > 32768
      )
        throw new Error(
          "snapshot_ref must contain 1 to 32768 characters from the latest snapshot response.",
        );
      return call(input, path("loadMoreBacklinkRows"), "POST", body(input, ["project_id"]));
    case "estimateBacklinksCost":
      return call(
        input,
        `${path("analyzeBacklinks")}${estimateQuery(input, [
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
      return call(input, path("analyzeDomainOverview"), "POST", body(input, ["project_id"]));
    case "loadDomainOverviewHistory":
      return call(input, path("loadDomainOverviewHistory"), "POST", body(input, ["project_id"]));
    case "loadDomainOverviewKeywords":
      return call(input, path("loadDomainOverviewKeywords"), "POST", body(input, ["project_id"]));
    case "loadDomainOverviewPages":
      return call(input, path("loadDomainOverviewPages"), "POST", body(input, ["project_id"]));
    case "estimateDomainOverviewCost":
      return call(input, path("analyzeDomainOverview"), "POST", {
        ...body(input, ["project_id"]),
        estimate_only: true,
      });
    case "createSignal":
      return call(input, path("createSignal"), "POST", body(input, ["project_id"]));
    case "listSignals":
      return call(
        input,
        `${path("listSignals")}${query(input, [
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
        `${path("listProjectApiKeys")}${query(input, ["cursor", "limit"])}`,
        "GET",
      );
    case "createProjectApiKey":
      return call(input, path("createProjectApiKey"), "POST", body(input, ["project_id"]));
    case "setProviderEnabled":
      return call(input, path("updateProviderSettings"), "PATCH", { enabled: input.enabled });
    case "setProviderPriority":
      return call(input, path("updateProviderSettings"), "PATCH", { priority: input.priority });
    case "setPrimaryProvider":
      // Deprecated compatibility alias: primary=true promotes priority 0;
      // primary=false (and only false) is a legacy no-op. Default when the
      // field is omitted matches the legacy promote-to-primary semantics.
      return call(
        input,
        path("updateProviderSettings"),
        "PATCH",
        input.primary === false ? {} : { priority: 0 },
      );
    case "listStoredReports":
      return call(input, path("listStoredResearchReports"), "GET");
    case "getStoredReport": {
      const kind = typeof input.kind === "string" ? input.kind : "";
      return call(
        input,
        `${path("listStoredResearchReports")}/${encodeURIComponent(kind)}${storedReportQuery(input, kind)}`,
        "GET",
      );
    }
    default:
      return null;
  }
}
