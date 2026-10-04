import { researchWorkspaceSchemas } from "@/lib/mcp/research-workspace-contract";
import { apiCredentialSecurity } from "./openapi-pat";
import { researchWorkspaceResponse } from "./openapi-research-workspace-schemas";
import { researchWorkspaceOperationPolicy } from "./research-workspace-policy";

const titles = {
  getProjectContext: "Get project context",
  updateProjectContext: "Update project context",
  listAgentReports: "List agent reports",
  createAgentReport: "Create agent report",
  getAgentReport: "Get agent report",
  analyzeAiVisibility: "Analyze AI visibility",
  compareAiPrompts: "Compare AI prompts",
  runSiteAudit: "Run site audit",
  listSiteAudits: "List site audits",
  getSiteAudit: "Get site audit",
} as const;

const json = (schema: object) => ({ "application/json": { schema } });
const problem = (description: string) => ({
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
  description,
});

export function researchWorkspacePaths() {
  const paths: Record<string, Record<string, object>> = {};
  for (const [key, policy] of Object.entries(researchWorkspaceOperationPolicy)) {
    const operationId = key as keyof typeof titles;
    const input = researchWorkspaceSchemas[operationId];
    const pathParameters = ["project_id", "report_id"]
      .filter((name) => policy.path.includes(`{${name}}`))
      .map((name) => ({ in: "path", name, required: true, schema: input.properties?.[name] }));
    const properties = Object.fromEntries(
      Object.entries(input.properties ?? {}).filter(
        ([name]) => !["project_id", "report_id", "idempotency_key"].includes(name),
      ),
    );
    const required = (input.required ?? []).filter(
      (name) => !["project_id", "report_id", "idempotency_key"].includes(name),
    );
    const paid = ["analyzeAiVisibility", "compareAiPrompts"].includes(operationId);
    const responses = {
      [operationId === "createAgentReport" ? "201" : "200"]: {
        content: json(researchWorkspaceResponse(operationId)),
        description: "Project-scoped result",
      },
      "400": problem("Invalid input"),
      "401": problem("Unauthorized"),
      "403": problem("Project role or token scope denied"),
      "404": problem("Project or report not found"),
      "422": problem("Provider unavailable or analysis cost cap exceeded"),
      "423": problem("Project is read-only"),
      "429": problem("Rate limited"),
      ...(paid
        ? { "402": problem("Deployment credits exhausted for a paid provider request") }
        : {}),
    };
    const mutation = policy.method !== "GET";
    const parameters = Object.keys(properties).map((name) => ({
      in: "query",
      name,
      schema: properties[name],
    }));
    paths[policy.path] ??= {};
    paths[policy.path][policy.method.toLowerCase()] = {
      operationId,
      summary: titles[operationId],
      description: paid
        ? "Requires an explicit cost cap. estimate_only makes no paid request. Observed AI datasets and synthetic prompt tests remain distinct."
        : operationId === "createAgentReport"
          ? "Save external analysis. Producer kinds site_audit, ai_visibility and prompt_explorer are reserved. Access follows existing project membership and token scopes."
          : "Access follows existing project membership and token scopes.",
      security: apiCredentialSecurity,
      responses,
      parameters: mutation ? pathParameters : [...pathParameters, ...parameters],
      ...(mutation
        ? {
            requestBody: {
              content: json({ additionalProperties: false, properties, required, type: "object" }),
              required: true,
            },
          }
        : {}),
    };
  }
  return paths;
}
