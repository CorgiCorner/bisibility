import { aiTrackingSchemas } from "@/lib/mcp/tracking-contract";
import { paymentRequestFields } from "./openapi-action-payment";
import { apiCredentialSecurity } from "./openapi-pat";
import { problemResponse } from "./openapi-problem";
import { appOwnedTrackingParameters } from "./openapi-tracking-parameters";
import { appOwnedTrackingRunOperations } from "./openapi-tracking-run-inputs";
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
const problem = (description: string) => problemResponse(description);
/** Run operations whose planner rejects a missing Idempotency-Key (the router maps the header). */
const keyedRunOperations = new Set(["createAiTrackingRun", "retryAiTrackingRun"]);

function withComponentReferences(value: unknown, operationId: string): unknown {
  if (Array.isArray(value)) return value.map((item) => withComponentReferences(item, operationId));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "$ref" && typeof item === "string" && item.startsWith("#/definitions/")
        ? `#/components/schemas/${operationId}_${item.slice("#/definitions/".length)}`
        : withComponentReferences(item, operationId),
    ]),
  );
}

/** Preserve recursive input definitions when moving MCP schemas into an OpenAPI document. */
export function aiTrackingSchemaComponents(): Record<string, object> {
  return Object.fromEntries(
    Object.entries(aiTrackingSchemas()).flatMap(([operationId, input]) =>
      operationId in appOwnedTrackingParameters || operationId in appOwnedTrackingRunOperations
        ? []
        : Object.entries((input.definitions ?? {}) as Record<string, object>).map(
            ([name, schema]) => [
              `${operationId}_${name}`,
              withComponentReferences(schema, operationId) as object,
            ],
          ),
    ),
  );
}

function queryParameters(properties: Record<string, unknown>, required: readonly string[]) {
  return Object.entries(properties).map(([field, schema]) => ({
    in: "query",
    name: field,
    required: required.includes(field),
    schema,
  }));
}

export function aiTrackingPaths() {
  const inputs = aiTrackingSchemas();
  const paths: Record<string, Record<string, object>> = {};
  for (const [name, operation] of Object.entries(aiTrackingPolicies)) {
    const operationId = name as keyof typeof inputs;
    const runOwned = appOwnedTrackingRunOperations[operationId];
    const owned =
      runOwned?.parameters ??
      appOwnedTrackingParameters[operationId as keyof typeof appOwnedTrackingParameters];
    const input: { properties?: Record<string, unknown>; required?: string[] } = owned
      ? {}
      : inputs[operationId];
    const properties = withComponentReferences(input.properties ?? {}, operationId) as Record<
      string,
      unknown
    >;
    if (operationId === "aiTrackingSuggestionsGenerate")
      Object.assign(properties, {
        accepted_payment: paymentRequestFields.accepted_payment,
        require_payment: paymentRequestFields.require_payment,
      });
    const parameters: object[] = owned ? [...owned] : [];
    for (const [field, schema] of Object.entries(properties)) {
      if (operation.path.includes(`{${field}}`)) {
        parameters.push({ in: "path", name: field, required: true, schema });
        delete properties[field];
      }
    }
    delete properties.idempotency_key;
    const mutation = operation.method !== "GET";
    if (!mutation) {
      parameters.push(...queryParameters(properties, input.required ?? []));
    } else {
      parameters.push(
        runOwned && !keyedRunOperations.has(operationId) && operationId !== "previewAiTrackingRun"
          ? { $ref: "#/components/parameters/IdempotencyKey" }
          : {
              in: "header",
              name: "Idempotency-Key",
              required:
                keyedRunOperations.has(operationId) ||
                operationId === "aiTrackingSuggestionsGenerate",
              schema: {
                type: "string",
                maxLength: 200,
                ...(keyedRunOperations.has(operationId) ? { minLength: 1 } : {}),
                ...(operationId === "aiTrackingSuggestionsGenerate" ? { format: "uuid" } : {}),
              },
            },
      );
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
      ...(operationId === "cancelAiTrackingRun" || operationId === "suggestAiTrackingPrompts"
        ? { description: "No request body fields are used. An optional JSON body is ignored." }
        : {}),
      parameters,
      security: apiCredentialSecurity,
      ...(mutation && operation.method !== "DELETE" && (!runOwned || runOwned.body)
        ? {
            requestBody: {
              required: true,
              content: json(
                runOwned?.body ?? {
                  type: "object",
                  properties,
                  required: (input.required ?? []).filter((field) => field in properties),
                  additionalProperties: false,
                },
              ),
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
