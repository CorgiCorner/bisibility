import { researchWorkspaceSchemas } from "@/lib/mcp/research-workspace-contract";
import { paymentRequestFields } from "./openapi-action-payment";
import { BYOK_REQUIRED_RESPONSE } from "./openapi-operations";
import { apiCredentialSecurity } from "./openapi-pat";
import { problemResponse } from "./openapi-problem";
import { publicIdSchema } from "./openapi-public-id";
import { researchWorkspaceResponse } from "./openapi-research-workspace-schemas";
import { siteAuditRequest, siteAuditResponse } from "./openapi-site-audits";
import { researchWorkspaceOperationPolicy } from "./research-workspace-policy";

const titles = {
  getAiResearchCatalog: "Get AI research catalog",
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
const problem = problemResponse;

export function researchWorkspacePaths() {
  const paths: Record<string, Record<string, object>> = {};
  for (const [key, policy] of Object.entries(researchWorkspaceOperationPolicy)) {
    const operationId = key as keyof typeof titles;
    const audit = ["runSiteAudit", "listSiteAudits", "getSiteAudit"].includes(operationId);
    const input = audit
      ? {
          properties: {
            project_id: publicIdSchema("prj"),
            ...(operationId === "getSiteAudit" ? { report_id: publicIdSchema("agr") } : {}),
          },
          required: ["project_id"],
        }
      : researchWorkspaceSchemas[operationId];
    const pathParameters = ["project_id", "report_id"]
      .filter((name) => policy.path.includes(`{${name}}`))
      .map((name) => ({ in: "path", name, required: true, schema: input.properties?.[name] }));
    const properties = Object.fromEntries(
      Object.entries(input.properties ?? {}).filter(
        ([name]) =>
          !["project_id", "report_id"].includes(name) &&
          (name !== "idempotency_key" || operationId === "compareAiPrompts"),
      ),
    );
    const required = (input.required ?? []).filter(
      (name) => !["project_id", "report_id", "idempotency_key"].includes(name),
    );
    const paid = ["analyzeAiVisibility", "compareAiPrompts"].includes(operationId);
    if (paid) Object.assign(properties, paymentRequestFields);
    const responses = {
      [operationId === "createAgentReport" ? "201" : "200"]: {
        content: json(
          audit ? siteAuditResponse(operationId) : researchWorkspaceResponse(operationId),
        ),
        description: "Project-scoped result",
      },
      "400": problem("Invalid input"),
      "401": problem("Unauthorized"),
      "403": problem(
        paid
          ? `Project role or token scope denied, or ${BYOK_REQUIRED_RESPONSE}`
          : "Project role or token scope denied",
      ),
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
        ? operationId === "compareAiPrompts"
          ? "Default hard_cap requires max_cost_cents and preserves original mini/nano512 availability. 0 = cached result only; a miss returns cost_limit_exceeded with estimated_cost_cents before paid work. If extended-option pricing requires provider metadata, cache-only access returns pricing_unavailable without refreshing it. Explicit own-BYOK provider_actual_cost requires non_guaranteed_estimate_v1 acknowledgement and a separate advisory limit; partial estimate covers tokens and base only, excludes variable tools/loops/role overhead, and has no guaranteed maximum. Execution requires the forecast credential identity and stable UUID. Actual single-task provider receipts settle the charge; pending or unknown cost prevents another paid attempt until reconciled. estimate_only makes no paid request."
          : "Requires an explicit cost cap. estimate_only makes no paid request. Observed AI datasets and synthetic prompt tests remain distinct."
        : operationId === "createAgentReport"
          ? "Save external analysis. Producer kinds site_audit, ai_visibility and prompt_explorer are reserved. Access follows existing project membership and token scopes."
          : "Access follows existing project membership and token scopes.",
      security: apiCredentialSecurity,
      responses,
      parameters: mutation
        ? [
            ...pathParameters,
            ...(audit ? [{ $ref: "#/components/parameters/IdempotencyKey" }] : []),
          ]
        : [...pathParameters, ...parameters],
      ...(mutation
        ? {
            requestBody: {
              content: json(
                audit
                  ? siteAuditRequest
                  : {
                      additionalProperties: false,
                      ...(operationId === "analyzeAiVisibility" ? { allOf: input.allOf } : {}),
                      properties,
                      required,
                      type: "object",
                      ...(operationId === "compareAiPrompts" && Array.isArray(input.oneOf)
                        ? {
                            oneOf: (
                              input.oneOf as { not?: { anyOf?: object[] } }[] | undefined
                            )?.map((branch, index) =>
                              index === 0
                                ? {
                                    ...branch,
                                    not: {
                                      anyOf: [
                                        ...(branch.not?.anyOf ?? []),
                                        { required: ["idempotency_key"] },
                                      ],
                                    },
                                  }
                                : branch,
                            ),
                          }
                        : {}),
                    },
              ),
              required: true,
            },
          }
        : {}),
    };
  }
  return paths;
}
