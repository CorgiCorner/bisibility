import { publicIdSchema } from "./openapi-public-id";

const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
export const defaultsReviewSchemas = {
  ProjectDefaultsReview: {
    type: "object",
    additionalProperties: false,
    properties: {
      expected_source_hash: hash,
      expected_revision: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      preview_token: { type: "string", minLength: 1, maxLength: 8192 },
      idempotency_key: { type: "string", minLength: 8, maxLength: 128 },
      confirmed: { type: "boolean", const: true },
    },
    required: [
      "expected_source_hash",
      "expected_revision",
      "preview_token",
      "idempotency_key",
      "confirmed",
    ],
  },
  ProjectDefaultsPreview: {
    type: "object",
    additionalProperties: false,
    properties: {
      request: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { const: "patch", type: "string" },
          values: {
            allOf: [
              { $ref: "#/components/schemas/ProjectDefaultsPatch" },
              {
                properties: { project_id: publicIdSchema("prj") },
                required: ["project_id"],
                type: "object",
              },
            ],
          },
        },
        required: ["kind", "values"],
      },
      draft: {
        allOf: [
          { $ref: "#/components/schemas/ProjectDefaultsPatch" },
          {
            properties: { project_id: publicIdSchema("prj") },
            required: [
              "project_id",
              "country",
              "device",
              "location_key",
              "frequency",
              "timezone",
              "jitter_minutes",
              "serp_depth",
              "serp_stop_on_match",
            ],
            type: "object",
          },
        ],
      },
      expected_source_hash: hash,
      expected_revision: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
      preview_token: { type: "string", minLength: 1, maxLength: 8192 },
      expires_at: { type: "string", format: "date-time" },
      resolved: {
        type: "object",
        additionalProperties: false,
        properties: {
          location_key: { type: "string" },
          label: { type: "string" },
          language_code: { type: "string" },
          device: { type: "string", enum: ["desktop", "mobile"] },
        },
        required: ["location_key", "label", "language_code", "device"],
      },
      impact: {
        type: "object",
        additionalProperties: false,
        properties: {
          existing_target_retargets: { type: "integer", const: 0 },
          new_targets: { type: "integer", const: 0 },
          inherited_depth_targets: { type: "integer", minimum: 0 },
          recurring_estimate: { type: "string", enum: ["unchanged", "unknown"] },
          scope_changed: { type: "boolean" },
          cadence_changed: { type: "boolean" },
        },
        required: [
          "existing_target_retargets",
          "new_targets",
          "inherited_depth_targets",
          "recurring_estimate",
          "scope_changed",
          "cadence_changed",
        ],
      },
      policy_ready: { type: "boolean" },
    },
    required: [
      "request",
      "draft",
      "expected_source_hash",
      "expected_revision",
      "preview_token",
      "expires_at",
      "resolved",
      "impact",
      "policy_ready",
    ],
  },
};

export function reviewedDefaultsPaths(input: {
  bearer: (
    summary: string,
    id: string,
    schema: object,
    request?: object,
    parameters?: object[],
  ) => object;
  ref: (name: "ProjectDefaults" | "ProjectDefaultsPatch" | "ProjectDefaultsPreview") => object;
  response: (schema: object, description?: string) => object;
  problemResponse: (description: string) => object;
  problemResponses: object;
}) {
  return {
    "/projects/{project_id}/defaults": {
      get: input.bearer("Get project defaults", "getProjectDefaults", input.ref("ProjectDefaults")),
      patch: {
        ...input.bearer(
          "Update project defaults",
          "updateProjectDefaults",
          input.ref("ProjectDefaults"),
          input.ref("ProjectDefaultsPatch"),
          [
            {
              in: "query",
              name: "preview_only",
              schema: { type: "boolean", default: false },
              description:
                "Requires capabilities.features.reviewed_project_defaults=v1. true reads the current signed draft without writes or provider calls. Confirm that exact draft with review on a later PATCH.",
            },
          ],
        ),
        description:
          "Preview first, then confirm the exact source/revision/token with a stable command key. Lost responses replay the same committed receipt. Omitted review refuses before writes; changed source or expired quotes require a new preview. Existing targets/history are not retargeted.",
        responses: {
          ...input.problemResponses,
          "200": input.response({
            anyOf: [input.ref("ProjectDefaults"), input.ref("ProjectDefaultsPreview")],
          }),
          "409": input.problemResponse("Quote, source or command changed"),
          "428": input.problemResponse("Current preview and explicit confirmation required"),
        },
      },
    },
  };
}
