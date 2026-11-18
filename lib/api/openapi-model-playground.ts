import { z } from "zod";
import { modelPlaygroundPolicies, modelPlaygroundRunIdContract } from "./model-playground-registry";
import {
  modelPlaygroundAdmissionSchema,
  modelPlaygroundCatalogInputSchema,
  modelPlaygroundCatalogSchema,
  modelPlaygroundCreateSchema,
  modelPlaygroundEstimateSchema,
  modelPlaygroundPreviewInputSchema,
  modelPlaygroundPreviewSchema,
  modelPlaygroundRunSchema,
} from "./model-playground-schemas";
import { modelPlaygroundWireSchema } from "./openapi-model-playground-schema";
import { idempotencyParameterComponents } from "./openapi-parameters";
import { apiCredentialSecurity } from "./openapi-pat";
import { problemResponse, problemResponses } from "./openapi-problem";

const wire = (schema: z.ZodType, name: string, request = false) => {
  const result = modelPlaygroundWireSchema(z.toJSONSchema(schema, { io: "input" }), name, request);
  delete result["x-bisibility-name"];
  return result;
};
export const modelPlaygroundSchemas = {
  ModelPlaygroundCatalog: wire(modelPlaygroundCatalogSchema, "ModelPlaygroundCatalogData"),
  ModelPlaygroundPreviewInput: wire(
    modelPlaygroundPreviewInputSchema,
    "ModelPlaygroundPreviewRequest",
    true,
  ),
  ModelPlaygroundEstimate: wire(modelPlaygroundEstimateSchema, "ModelPlaygroundEstimateData"),
  ModelPlaygroundPreview: wire(modelPlaygroundPreviewSchema, "ModelPlaygroundPreviewData"),
  ModelPlaygroundCreateInput: wire(
    modelPlaygroundCreateSchema,
    "ModelPlaygroundCreateRequest",
    true,
  ),
  ModelPlaygroundAdmission: wire(modelPlaygroundAdmissionSchema, "ModelPlaygroundAdmissionData"),
  ModelPlaygroundRun: wire(modelPlaygroundRunSchema, "ModelPlaygroundRunData"),
};
const configs = {
  getModelPlaygroundCatalog: ["Get Model Playground catalog", "ModelPlaygroundCatalog", undefined],
  estimateModelPlaygroundRun: [
    "Estimate a Model Playground run",
    "ModelPlaygroundEstimate",
    "ModelPlaygroundPreviewInput",
  ],
  previewModelPlaygroundRun: [
    "Preview a Model Playground run",
    "ModelPlaygroundPreview",
    "ModelPlaygroundPreviewInput",
  ],
  createModelPlaygroundRun: [
    "Create a Model Playground run",
    "ModelPlaygroundAdmission",
    "ModelPlaygroundCreateInput",
  ],
  getModelPlaygroundRun: ["Get a Model Playground run", "ModelPlaygroundRun", undefined],
} as const;
const recoveryDescription =
  "To explicitly recover after a 500, use a NEW Idempotency-Key with the same quote and identical body, including the same confirm_unknown when present. Outcomes are saved admission including run_id with replayed=true, fresh admission with replayed=false if nothing committed, confirmation_required, or not_dispatched (for example quote_expired). If confirmation committed, the service returns its saved admission rather than confirmation_spent merely because its nonce was consumed. The original key replays the cached 500.";
const descriptions = {
  getModelPlaygroundCatalog:
    "Free metadata for one project-owned native connection. Workspace scope is honored. No model call is made.",
  estimateModelPlaygroundRun:
    "Non-binding cost estimate that needs only read scope. It is computed in memory and stores nothing: no quote, no preview, no idempotency replay entry and no activity, so an Idempotency-Key is ignored. The response has no quote ID or expiry and cannot be passed to create; use previewModelPlaygroundRun (write scope) for a binding quote. Only a cached model catalog is used: when none is cached the column forecast is unknown, and no provider or model call is made. budget_available reports only yes/no for whether the project spending budget would admit a run now, never an amount, limit or usage; it is advisory, so create can still refuse with budget_exhausted. Limited to 60 requests per minute per credential and project; excess requests return 429 with Retry-After.",
  previewModelPlaygroundRun:
    "Free preflight for native own-key columns. The server binds the opaque quote ID to actor, project, exact settings, connection revision, catalog, rates and advisory budget. Forecast money carries basis and certainty; unavailable cost is null. No model call is made.",
  createModelPlaygroundRun:
    "The provider bills the customer's own key, never platform credits. Idempotency-Key is required: the router replays the same key for 24 hours (scoped to credential, method and path), bound to identical body bytes. A different body returns validation_failed (422), including after confirmation_required, not_dispatched or cached errors; legacy cache entries without a body binding also return 422. For a lost response, retry the identical request with that key; cached 500/503 responses require the recovery steps below. After confirmation_required, use a NEW Idempotency-Key bound to the same quote and exact server nonce, content hash and unresolved attempt set. Never reuse the initial key for confirm_unknown: the changed body is refused with 422. The service binds the key to the quote and admission deduplicates attempts beyond HTTP replay. Only a committed refusal is not_dispatched; a 500 is uncertain and must not cause an automatic paid retry. " +
    recoveryDescription +
    " After a 503 and enablement, a manual retry also needs a NEW Idempotency-Key with the same quote and identical body. Admission is not completion.",
  getModelPlaygroundRun:
    "Reads one persisted composite run, with independent column progress and retained results. No model call, retry or paid refresh. Unknown money stays null; estimates are never reported charges. A result cost whose certainty is neither reported nor unknown becomes unknown, and that estimate is copied to cost_evidence.local_estimate only when the slot is empty. A demoted estimate keeps its receipt unchanged, without a mismatch marker, when that estimate is copied to local_estimate. Evidence money that does not match its public shape becomes null, and a result cost that does not match becomes unknown, so the read still returns every answer. A receipt provider cost is kept when it matches the result: reported agrees with measured or free, and unknown agrees with unknown, in the same currency and canonical decimal amount. The receipt keeps its stored decimal. An unknown receipt provider cost beside a reported result is returned unchanged. Any other disagreement does not fail the read: every answer is kept, and only that column's receipt provider cost becomes unknown, using the option payable unit, with cost_evidence set to mismatch. A column whose stored result cannot be shown is returned with a null result and result_issue unprojectable; every other column has result_issue null. History uses existing agent-report operations. Saving a manual preset is app-only in V1.",
};
const json = (schema: object) => ({ "application/json": { schema } });
export function modelPlaygroundPaths() {
  const paths: Record<string, Record<string, object>> = {};
  for (const [id, policy] of Object.entries(modelPlaygroundPolicies)) {
    const operationId = id as keyof typeof configs;
    const [summary, output, input] = configs[operationId];
    const parameters: object[] = [];
    if (operationId === "getModelPlaygroundCatalog") {
      const query = wire(modelPlaygroundCatalogInputSchema, "ModelPlaygroundCatalogQuery", true);
      for (const [name, schema] of Object.entries(query.properties as Record<string, object>))
        parameters.push({
          in: "query",
          name,
          schema,
          required: (query.required as string[]).includes(name),
        });
    }
    if (operationId === "createModelPlaygroundRun")
      parameters.push({ ...idempotencyParameterComponents.IdempotencyKey, required: true });
    if (operationId === "getModelPlaygroundRun")
      parameters.push({
        in: "path",
        name: "run_id",
        required: true,
        schema: {
          ...modelPlaygroundRunIdContract.schema,
          description: "Persisted composite run UUID, resolved only within this project.",
        },
      });
    paths[policy.path] ??= {};
    paths[policy.path][policy.method.toLowerCase()] = {
      operationId,
      summary,
      description: descriptions[operationId],
      security: apiCredentialSecurity,
      parameters,
      ...(input
        ? {
            requestBody: {
              required: true,
              content: json({ $ref: `#/components/schemas/${input}` }),
            },
          }
        : {}),
      responses: {
        "200": {
          description: "Project-scoped result",
          content: json({
            type: "object",
            additionalProperties: false,
            properties: { data: { $ref: `#/components/schemas/${output}` } },
            required: ["data"],
            "x-bisibility-name": `${output}Response`,
          }),
        },
        ...problemResponses,
        ...(operationId === "createModelPlaygroundRun"
          ? {
              "422": problemResponse(
                "validation_failed: this key has a different body binding, or its legacy cache entry has no body binding. No service call is made. Use a new key with the intended body.",
              ),
            }
          : {}),
        ...(operationId === "createModelPlaygroundRun" ||
        operationId === "previewModelPlaygroundRun" ||
        operationId === "estimateModelPlaygroundRun"
          ? {
              "413": problemResponse(
                "bad_request: the JSON body exceeds 10485760 bytes. No service call is made.",
              ),
            }
          : {}),
        "500": problemResponse(
          operationId === "createModelPlaygroundRun"
            ? `Run status is uncertain; do not automatically retry. ${recoveryDescription}`
            : "Unexpected server error.",
        ),
        "503": {
          description:
            "Non-retryable not_available_yet from the disabled or unwired service; details.retryable is false. Do not automatically retry this 503. For create, after enablement manually retry with a NEW Idempotency-Key and the same quote; the original key replays the cached 503.",
          content: {
            "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
          },
        },
      },
    };
  }
  return paths;
}
