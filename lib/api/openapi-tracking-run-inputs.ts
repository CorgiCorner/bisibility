import { TRACKING_ENGINES, TRACKING_SOURCES } from "@/lib/ai-tracking/contract";
import { paymentRequestFields } from "./openapi-action-payment";
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
const recurringPayment = {
  payment_schedule_id: publicIdSchema("ais"),
  payment_scope: {
    type: "string",
    enum: ["manual", "recurring"],
    ...closedEnum("AiTrackingPaymentScope"),
  },
  payment_recurrence: {
    type: "object",
    ...sdkName("AiTrackingPaymentRecurrence"),
    properties: { cron: text, timezone: text },
    required: ["cron", "timezone"],
  },
};
const paymentFields = {
  accepted_payment: paymentRequestFields.accepted_payment,
  require_payment: paymentRequestFields.require_payment,
  ...recurringPayment,
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
        ...recurringPayment,
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
        ...paymentFields,
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

// Schedule templates and retries use the planner directly, rather than the stricter
// create-run REST boundary. Lookup and cross-field rules still apply in trackingPlan.
const planProperties = {
  ...common,
  ...paymentFields,
  prompt_ids: { type: "array", items: nonempty, maxItems: 100 },
  credential_connection_id: nonempty,
  credential_version: nonempty,
  budget_revision: nonempty,
  consent_revision: nonempty,
  deadline: { type: "string", format: "date-time" },
  schedule_id: text,
  planned_at: { type: "string", format: "date-time" },
  retry_of_run_id: text,
};
const planRequired = [
  "prompt_ids",
  "configurations",
  "credential_connection_id",
  "credential_version",
  "budget_revision",
  "consent_revision",
  "deadline",
];
const plan = {
  type: "object",
  ...sdkName("AiTrackingPlanInput"),
  properties: planProperties,
  required: planRequired,
  description:
    "Project-scoped prompt, schedule and connection lookups must succeed. Manual plans require at least one prompt. schedule_id and planned_at must be supplied together. No per-request cost cap is supported.",
};
const scheduleProperties = {
  name: { ...nonempty, maxLength: 200 },
  cron: { ...nonempty, maxLength: 200 },
  timezone: { ...nonempty, maxLength: 100 },
  enabled: { type: "boolean" },
  configuration: plan,
  next_run_at: { type: ["string", "null"], format: "date-time" },
  consent: {
    type: "boolean",
    description: "Must be true when approving an enabled schedule configuration.",
  },
};
const topicProperties = {
  name: { ...nonempty, maxLength: 200 },
  description: { type: ["string", "null"], maxLength: 4000 },
  paused: { type: "boolean" },
};
const promptProperties = {
  text: { ...nonempty, maxLength: 64000 },
  topic_id: { type: ["string", "null"] },
  label: { type: ["string", "null"], maxLength: 200 },
  paused: { type: "boolean" },
  category: {
    type: "string",
    enum: ["neutral", "comparative", "branded"],
    ...closedEnum("AiTrackingPromptCategoryInput"),
  },
  generation_reference: {
    type: "object",
    ...sdkName("AiTrackingPromptGenerationReferenceInput"),
    properties: {
      generation_id: publicIdSchema("asg"),
      draft_id: { type: "string", format: "uuid" },
    },
    required: ["generation_id", "draft_id"],
    additionalProperties: false,
  },
  provider_dataset_reference: {
    type: "object",
    ...sdkName("AiTrackingPromptDatasetReferenceInput"),
    properties: {
      report_id: publicIdSchema("agr"),
      row_index: { type: "integer", minimum: 0, maximum: 9999 },
    },
    required: ["report_id", "row_index"],
    additionalProperties: false,
  },
};
const member = (name: string, prefix: string) => ({
  in: "path",
  name,
  required: true,
  schema: publicIdSchema(prefix),
});
for (const [resource, prefix, properties, required] of [
  ["Topic", "ait", topicProperties, ["name"]],
  ["Prompt", "aip", promptProperties, ["text"]],
  ["Schedule", "ais", scheduleProperties, ["name", "cron", "timezone", "configuration"]],
] as const) {
  for (const action of ["create", "update", "archive"] as const) {
    appOwnedTrackingRunOperations[`${action}AiTracking${resource}`] = {
      parameters: [
        project,
        ...(action === "create" ? [] : [member(`${resource.toLowerCase()}_id`, prefix)]),
      ],
      ...(action === "archive"
        ? {}
        : {
            body: {
              type: "object",
              ...(resource === "Schedule"
                ? {
                    description:
                      "Enabling a disabled schedule requires a reviewed configuration and explicit consent. Disabling or changing other fields may omit configuration.",
                  }
                : {}),
              ...sdkName(`AiTracking${resource}${action === "create" ? "Create" : "Update"}Input`),
              properties,
              required: action === "create" ? required : [],
            },
          }),
    };
  }
}
appOwnedTrackingRunOperations.retryAiTrackingRun = {
  parameters: [project, run],
  body: {
    ...plan,
    ...sdkName("AiTrackingRunRetryInput"),
    properties: { ...planProperties, consent: { type: "boolean", const: true } },
    required: [...planRequired, "consent"],
    description: `${plan.description} Explicit consent is required and all original samples must be terminal. retry_of_run_id is replaced by the selected run.`,
  },
};
appOwnedTrackingRunOperations.cancelAiTrackingRun = { parameters: [project, run] };
appOwnedTrackingRunOperations.suggestAiTrackingPrompts = { parameters: [project] };
