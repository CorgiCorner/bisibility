import { paymentResponseFields } from "./openapi-action-payment";
import { publicIdSchema } from "./openapi-public-id";
import { sdkName, usdCents } from "./openapi-sdk-schema";

const time = { format: "date-time", type: ["string", "null"] } as const;
const count = { minimum: 0, type: "integer" } as const;
export const rankRunSchemas = {
  RankCheckRunRead: {
    type: "object",
    properties: {
      payment: paymentResponseFields.payment,
      id: publicIdSchema("rcr"),
      project_id: publicIdSchema("prj"),
      status: { type: "string", description: "Execution status; readers tolerate future values." },
      outcome: { type: ["string", "null"] },
      terminal: { type: "boolean" },
      polling_state: {
        type: "string",
        description:
          "terminal, blocked, deferred, active, or unknown; no rank-check row is required.",
      },
      trigger: { type: "string" },
      counts_basis: { type: "string" },
      counts: {
        ...sdkName("RankCheckRunCounts"),
        type: "object",
        properties: {
          requested: count,
          total: count,
          completed: count,
          failed: count,
          deferred: count,
          skipped: count,
          cancelled: count,
        },
        required: ["requested", "total", "completed", "failed", "deferred", "skipped", "cancelled"],
      },
      keyword_count: count,
      target_count: count,
      planned_for: time,
      launched_at: time,
      started_at: time,
      finished_at: time,
      blocked_reason: { type: ["string", "null"] },
      parent_run_id: { ...publicIdSchema("rcr"), type: ["string", "null"] },
      cost_cents: { ...usdCents, minimum: 0, type: ["number", "null"] },
      usage: {
        ...sdkName("RankCheckRunUsage"),
        type: ["object", "null"],
        properties: {
          actual: { ...count, type: ["integer", "null"] },
          estimated: { ...count, type: ["integer", "null"] },
          unit: { type: "string" },
        },
        required: ["actual", "estimated", "unit"],
      },
      native_estimate: {
        ...sdkName("RankCheckRunNativeEstimate"),
        type: ["object", "null"],
        properties: {
          provider_id: { type: ["string", "null"] },
          unit: { type: ["string", "null"] },
          quantity: { minimum: 0, type: ["number", "null"] },
          unknown_targets: count,
        },
        required: ["provider_id", "unit", "quantity", "unknown_targets"],
      },
    },
    required: [
      "id",
      "project_id",
      "status",
      "outcome",
      "terminal",
      "polling_state",
      "trigger",
      "counts",
      "counts_basis",
      "keyword_count",
      "target_count",
      "planned_for",
      "launched_at",
      "started_at",
      "finished_at",
      "blocked_reason",
      "parent_run_id",
      "cost_cents",
      "usage",
      "native_estimate",
    ],
  },
  RankCheckRunReadList: {
    type: "object",
    properties: {
      data: { type: "array", items: { $ref: "#/components/schemas/RankCheckRunRead" } },
      meta: {
        ...sdkName("RankCheckRunListMeta"),
        type: "object",
        properties: { next_cursor: { type: ["string", "null"] } },
        required: ["next_cursor"],
      },
    },
    required: ["data", "meta"],
  },
} as const;
