import { aiTrackingSchemas } from "@/lib/mcp/tracking-contract";
import { ref } from "./openapi-components";
import { apiCredentialSecurity } from "./openapi-pat";
import { aiTrackingResponseSchema } from "./openapi-tracking-schemas";
import { aiTrackingPolicies } from "./operation-policy-ai-tracking";

const summaries: Record<keyof typeof aiTrackingPolicies, string> = {
  listAiTrackingTopics: "List AI tracking topics",
  createAiTrackingTopic: "Create an AI tracking topic",
  updateAiTrackingTopic: "Update an AI tracking topic",
  archiveAiTrackingTopic: "Archive an AI tracking topic",
  listAiTrackingPrompts: "List AI tracking prompts",
  createAiTrackingPrompt: "Create an AI tracking prompt",
  updateAiTrackingPrompt: "Revise an AI tracking prompt",
  archiveAiTrackingPrompt: "Archive an AI tracking prompt",
  listAiTrackingSchedules: "List AI tracking schedules",
  createAiTrackingSchedule: "Create an AI tracking schedule",
  updateAiTrackingSchedule: "Update an AI tracking schedule",
  archiveAiTrackingSchedule: "Archive an AI tracking schedule",
  previewAiTrackingRun: "Preview an AI tracking run",
  createAiTrackingRun: "Queue an AI tracking run",
  listAiTrackingRuns: "List AI tracking runs",
  getAiTrackingRun: "Get an AI tracking run",
  listAiTrackingSamples: "List AI tracking samples",
  cancelAiTrackingRun: "Cancel an AI tracking run",
  retryAiTrackingRun: "Retry an AI tracking run",
  getAiTrackingHistory: "Get AI tracking history",
  getAiTrackingTrends: "Compare AI tracking periods",
  exportAiTrackingEvidence: "Export AI tracking evidence",
  suggestAiTrackingPrompts: "Suggest AI tracking prompts",
  acceptAiTrackingSuggestions: "Accept AI tracking suggestions",
  aiTrackingSuggestionsPreview: "Preview AI prompt model generation",
  aiTrackingSuggestionsGenerate: "Generate AI prompt hypotheses",
};

const json = (schema: object) => ({ "application/json": { schema } });
const problem = (description: string) => ({ description, content: json(ref("Problem")) });

export function aiTrackingPaths() {
  const inputs = aiTrackingSchemas();
  const paths: Record<string, Record<string, object>> = {};
  for (const [name, operation] of Object.entries(aiTrackingPolicies)) {
    const operationId = name as keyof typeof inputs;
    const input = inputs[operationId];
    const properties = { ...input.properties };
    const parameters: object[] = [];
    for (const [field, schema] of Object.entries(properties)) {
      if (operation.path.includes(`{${field}}`)) {
        parameters.push({ in: "path", name: field, required: true, schema });
        delete properties[field];
      }
    }
    delete properties.idempotency_key;
    const mutation = operation.method !== "GET";
    if (!mutation) {
      for (const [field, schema] of Object.entries(properties))
        parameters.push({
          in: "query",
          name: field,
          required: Boolean(input.required?.includes(field)),
          schema,
        });
    } else {
      parameters.push({
        in: "header",
        name: "Idempotency-Key",
        required:
          operationId === "createAiTrackingRun" || operationId === "aiTrackingSuggestionsGenerate",
        schema: {
          type: "string",
          maxLength: 200,
          ...(operationId === "aiTrackingSuggestionsGenerate" ? { format: "uuid" } : {}),
        },
      });
    }
    const success = {
      description:
        "Project-scoped tracking data with retained provenance and explicit unknown measurements.",
      content: {
        ...json(aiTrackingResponseSchema(operationId)),
        ...(operationId === "exportAiTrackingEvidence"
          ? {
              "text/csv": {
                schema: {
                  type: "string",
                  description:
                    "Bounded formula-safe evidence CSV. X-Next-Cursor indicates more retained evidence.",
                },
              },
            }
          : {}),
      },
    };
    paths[operation.path] ??= {};
    paths[operation.path][operation.method.toLowerCase()] = {
      operationId,
      summary: summaries[operationId],
      parameters,
      security: apiCredentialSecurity,
      ...(mutation && operation.method !== "DELETE"
        ? {
            requestBody: {
              required: true,
              content: json({
                type: "object",
                properties,
                required: (input.required ?? []).filter((field) => field in properties),
                additionalProperties: false,
              }),
            },
          }
        : {}),
      responses: {
        [operationId.startsWith("create") || operationId === "acceptAiTrackingSuggestions"
          ? "201"
          : "200"]: success,
        "400": problem("Invalid input or cursor"),
        "401": problem("Authentication required"),
        "403": problem("Project membership or credential scope denied"),
        "404": problem("Project-scoped resource not found"),
        "409": problem("Idempotency key payload or state conflict"),
        "422": problem("Unsupported source, model, consent or cost policy"),
        "423": problem("Project is read-only"),
        "429": problem("Rate limited"),
      },
    };
  }
  return paths;
}
