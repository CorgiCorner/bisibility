import { TRACKING_ENGINES, TRACKING_SOURCES } from "@/lib/ai-tracking/contract";
import { publicIdSchema } from "./openapi-public-id";
import { closedEnum, sdkName } from "./openapi-sdk-schema";

const text = { type: "string" };
const nonempty = { ...text, minLength: 1 };
const configuration = {
  type: "object",
  ...sdkName("AiTrackingConfigurationInput"),
  properties: {
    provider: { const: "dataforseo", type: "string" },
    endpoint: { ...nonempty, maxLength: 256 },
    engine: { type: "string", enum: TRACKING_ENGINES, ...closedEnum("AiTrackingEngineInput") },
    source: { type: "string", enum: TRACKING_SOURCES, ...closedEnum("AiTrackingSourceInput") },
    model: { type: ["string", "null"], maxLength: 256 },
    parameters: {
      type: "object",
      additionalProperties: true,
      description: "Provider parameters; values are arbitrary JSON.",
    },
  },
  required: ["provider", "endpoint", "engine", "source", "model", "parameters"],
};
const common = {
  prompt_ids: {
    type: "array",
    items: {
      ...publicIdSchema("aip"),
      minLength: 1,
      description: "Public prompt ID resolved within the project.",
    },
    minItems: 1,
    maxItems: 100,
  },
  configurations: { type: "array", items: configuration, minItems: 1, maxItems: 20 },
};
const project = { in: "path", name: "project_id", required: true, schema: publicIdSchema("prj") };
const run = { in: "path", name: "run_id", required: true, schema: publicIdSchema("air") };

/** These REST inputs are owned by the app, independently of the SDK-derived MCP contract. */
export const appOwnedTrackingRunOperations: Record<
  string,
  { parameters: object[]; body?: object }
> = {
  previewAiTrackingRun: {
    parameters: [project],
    body: {
      type: "object",
      ...sdkName("AiTrackingRunPreviewInput"),
      properties: {
        ...common,
        prompt_ids: { ...common.prompt_ids, minItems: 1 },
        credential_connection_id: {
          ...publicIdSchema("conn"),
          description:
            "Optional public connection ID. Empty or omitted selects the default connection.",
        },
      },
      required: ["prompt_ids", "configurations"],
    },
  },
  createAiTrackingRun: {
    parameters: [project],
    body: {
      type: "object",
      ...sdkName("AiTrackingRunCreateInput"),
      description:
        "Queues paid work with explicit consent. Credential, budget and consent revisions must match a fresh preview. Manual runs require at least one prompt. schedule_id and planned_at must be supplied together. No per-request max_cost_cents is supported; admission checks the project provider budget.",
      properties: {
        ...common,
        credential_connection_id: {
          ...publicIdSchema("conn"),
          minLength: 1,
          description: "Public connection ID resolved within the project.",
        },
        credential_version: nonempty,
        budget_revision: nonempty,
        consent_revision: nonempty,
        consent: { type: "boolean", const: true },
        deadline: { type: "string", format: "date-time" },
        schedule_id: {
          ...publicIdSchema("ais"),
          description: "Public schedule ID resolved within the project.",
        },
        planned_at: { type: "string", format: "date-time" },
        retry_of_run_id: {
          ...text,
          description: "Compatibility plan field forwarded to the planner.",
        },
      },
      required: [
        "prompt_ids",
        "configurations",
        "credential_connection_id",
        "credential_version",
        "budget_revision",
        "consent_revision",
        "deadline",
        "consent",
      ],
    },
  },
  getAiTrackingRun: { parameters: [project, run] },
  listAiTrackingSamples: {
    parameters: [
      project,
      run,
      {
        in: "query",
        name: "limit",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      { in: "query", name: "cursor", required: false, schema: { type: "string", maxLength: 512 } },
    ],
  },
};
