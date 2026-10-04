import type { RestCall } from "./rest-call";
import type { JsonObject } from "./types";

const routes = {
  getProjectContext: ["GET", "context"],
  updateProjectContext: ["PATCH", "context"],
  listAgentReports: ["GET", "agent-reports"],
  createAgentReport: ["POST", "agent-reports"],
  getAgentReport: ["GET", "agent-reports"],
  analyzeAiVisibility: ["POST", "ai-visibility"],
  compareAiPrompts: ["POST", "prompt-explorer"],
  runSiteAudit: ["POST", "site-audits"],
  listSiteAudits: ["GET", "site-audits"],
  getSiteAudit: ["GET", "site-audits"],
} as const;

function required(input: JsonObject, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return encodeURIComponent(value);
}

export function dispatchResearchWorkspaceTool(name: string, input: JsonObject): RestCall | null {
  if (!(name in routes)) return null;
  const [method, resource] = routes[name as keyof typeof routes];
  let path = `/projects/${required(input, "project_id")}/${resource}`;
  if (name === "getAgentReport" || name === "getSiteAudit") {
    path += `/${required(input, "report_id")}`;
  }
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
        Object.entries(input).filter(([key]) => !["project_id", "idempotency_key"].includes(key)),
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
