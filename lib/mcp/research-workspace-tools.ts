import { operationPolicy } from "@/lib/api/operation-policy";
import { operationPath } from "./operation-path";
import type { RestCall } from "./rest-call";
import type { JsonObject } from "./types";

// MCP membership remains an explicit opt-in, independent of new REST policies.
const routes = [
  "getAiResearchCatalog",
  "getProjectContext",
  "updateProjectContext",
  "listAgentReports",
  "createAgentReport",
  "getAgentReport",
  "analyzeBrandVisibility",
  "compareAiPrompts",
  "runSiteAudit",
  "listSiteAudits",
  "getSiteAudit",
] as const;

export function dispatchResearchWorkspaceTool(name: string, input: JsonObject): RestCall | null {
  const operation = routes.find((candidate) => candidate === name);
  if (!operation) return null;
  const { method } = operationPolicy[operation];
  if (method === "PUT" || method === "DELETE") return null;
  let path = operationPath(operation, input);
  if (name === "listAgentReports") {
    const query = new URLSearchParams();
    for (const key of ["kind", "limit", "cursor"]) {
      const value = input[key];
      if (typeof value === "string" || typeof value === "number") query.set(key, String(value));
    }
    if (query.size) path += `?${query}`;
  }
  const mutating = method !== "GET";
  const body = mutating
    ? Object.fromEntries(
        Object.entries(input).filter(
          ([key]) =>
            key !== "project_id" &&
            (key !== "idempotency_key" ||
              (name === "compareAiPrompts" && input.cost_policy === "provider_actual_cost")),
        ),
      )
    : undefined;
  return {
    body,
    idempotencyKey: typeof input.idempotency_key === "string" ? input.idempotency_key : undefined,
    method,
    path,
    projectId: input.project_id as string,
  };
}
