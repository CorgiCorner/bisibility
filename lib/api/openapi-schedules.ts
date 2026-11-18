import { pageParameters } from "./openapi-parameters";
import { publicIdSchema } from "./openapi-public-id";
import { scheduleReviewProblems, scheduleWriteSchemas } from "./openapi-schedule-writes";
import { closedEnum, openEnum, publicIdUnion, sdkName, usdCents } from "./openapi-sdk-schema";
import { scheduleKinds, scheduleStates } from "./schedules-input";

const nullableString = { type: ["string", "null"] };
const timestamp = { ...nullableString, format: "date-time" };
const scheduleIdCases = [
  ["sch", "rank"],
  ["ais", "ai"],
  ["lmn", "localMonitor"],
  ["dsy", "dataSync"],
] as const;

export const scheduleIdSchema = {
  description:
    "Public schedule ID. Rank schedules use sch_, AI schedules use ais_, local monitors use lmn_, and data syncs use a stable dsy_ ID.",
  oneOf: scheduleIdCases.map(([prefix]) => publicIdSchema(prefix)),
  ...publicIdUnion(scheduleIdCases.map(([, name]) => name)),
  ...sdkName("ScheduleId"),
};

export const scheduleSchemas = {
  ...scheduleWriteSchemas,
  Schedule: {
    type: "object",
    properties: {
      id: scheduleIdSchema,
      kind: { type: "string", enum: scheduleKinds, ...openEnum("ScheduleKind") },
      group: { type: "string", enum: ["tracking", "data_sync"], ...openEnum("ScheduleGroup") },
      actions: {
        type: "array",
        items: { type: "string", enum: ["read"], ...openEnum("ScheduleAction") },
      },
      name: { type: "string" },
      state: { type: "string", enum: scheduleStates, ...openEnum("ScheduleState") },
      state_reason: {
        ...nullableString,
        enum: [
          "approval_expired",
          "limit_reached",
          "recurring_disabled",
          "instance_disabled",
          "integration_disconnected",
          "inspection_budget_off",
          null,
        ],
        ...openEnum("ScheduleStateReason"),
      },
      last_run_at: timestamp,
      last_run_status: {
        ...nullableString,
        enum: [
          "running",
          "succeeded",
          "failed",
          "completed",
          "snapshot_saved",
          "summary_saved",
          "inspection_failures",
          null,
        ],
        ...openEnum("ScheduleLastRunStatus"),
      },
      cadence: {
        type: "object",
        ...sdkName("ScheduleCadence"),
        properties: {
          frequency: {
            type: "string",
            enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
            ...openEnum("ScheduleFrequency"),
          },
          cron_expression: nullableString,
          time_of_day: nullableString,
          timezone: { type: "string" },
          jitter_minutes: {
            type: ["integer", "null"],
            description: "Null when jitter is unavailable for this kind.",
          },
        },
        required: ["frequency", "cron_expression", "time_of_day", "timezone", "jitter_minutes"],
      },
      target: {
        type: "object",
        ...sdkName("ScheduleTarget"),
        properties: {
          type: {
            type: "string",
            enum: ["keywords", "prompts", "monitor", "project"],
            ...openEnum("ScheduleTargetType"),
          },
          ids: {
            type: "array",
            items: { type: "string" },
            description: "Public target IDs, when available.",
          },
          domain: nullableString,
        },
        required: ["type"],
      },
      settings: {
        type: "object",
        additionalProperties: true,
        description: "Available settings for this schedule kind.",
      },
      limits: {
        type: "object",
        additionalProperties: true,
        description: "Available limits for this schedule kind.",
      },
      next_run_at: timestamp,
      monthly_cost_estimate_cents: {
        type: ["number", "null"],
        ...usdCents,
        description: "Server estimate shared with the web Schedules list; null when unknown.",
      },
      target_summary: {
        type: "object",
        ...sdkName("ScheduleTargetSummary"),
        properties: Object.fromEntries(
          ["keywords", "prompts", "monitors", "targets"].map((key) => [key, { type: "integer" }]),
        ),
      },
    },
    required: [
      "id",
      "kind",
      "group",
      "actions",
      "name",
      "state",
      "state_reason",
      "last_run_at",
      "last_run_status",
      "cadence",
      "target",
      "settings",
      "limits",
      "next_run_at",
      "monthly_cost_estimate_cents",
      "target_summary",
    ],
  },
};

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
  options?: { requestRequired?: boolean },
) => { responses: Record<string, unknown> };
export function schedulePaths(
  bearer: Bearer,
  list: (schema: object) => object,
  created: (
    summary: string,
    operationId: string,
    schema: object,
    request: object,
  ) => {
    responses: Record<string, unknown>;
  },
) {
  const ref = { $ref: "#/components/schemas/Schedule" };
  const create = created("Create a project schedule", "createSchedule", ref, {
    $ref: "#/components/schemas/CreateScheduleRequest",
  });
  const update = bearer(
    "Update a project schedule",
    "updateSchedule",
    ref,
    { $ref: "#/components/schemas/UpdateScheduleRequest" },
    [{ in: "path", name: "schedule_id", required: true, schema: scheduleIdSchema }],
    { requestRequired: true },
  );
  return {
    "/projects/{project_id}/schedules/preview": {
      post: bearer(
        "Preview a schedule change",
        "previewSchedule",
        { $ref: "#/components/schemas/ScheduleChangePreview" },
        { $ref: "#/components/schemas/PreviewScheduleRequest" },
        undefined,
        { requestRequired: true },
      ),
    },
    "/projects/{project_id}/schedules": {
      post: { ...create, responses: { ...create.responses, ...scheduleReviewProblems } },
      get: bearer("List project schedules", "listSchedules", list(ref), undefined, [
        ...pageParameters,
        {
          in: "query",
          name: "kind",
          schema: { type: "string", enum: scheduleKinds, ...closedEnum("ScheduleKindFilter") },
        },
        {
          in: "query",
          name: "state",
          description: "Defaults to current (active and paused) schedules.",
          schema: { type: "string", enum: scheduleStates, ...closedEnum("ScheduleStateFilter") },
        },
      ]),
    },
    "/projects/{project_id}/schedules/{schedule_id}": {
      patch: { ...update, responses: { ...update.responses, ...scheduleReviewProblems } },
      get: bearer("Get a project schedule", "getSchedule", ref, undefined, [
        { in: "path", name: "schedule_id", required: true, schema: scheduleIdSchema },
      ]),
    },
  };
}
