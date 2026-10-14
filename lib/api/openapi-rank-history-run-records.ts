import { publicIdSchema } from "./openapi-public-id";

const text = { type: "string" } as const;
const date = { type: "string", format: "date-time" } as const;
const integer = { type: "integer", minimum: 0 } as const;
const nullable = (value: object) => ({ anyOf: [value, { type: "null" }] });
const object = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
});
const base = {
  recorded_at: date,
  started_at: nullable(date),
  finished_at: nullable(date),
  status: text,
  blocked_reason: nullable(text),
  run_id: publicIdSchema("rcr"),
  rank_check_state: { const: "not_attached", type: "string" },
};

/** Nonmeasurement variants never synthesize a check, rank, or provider observation timestamp. */
export const rankHistoryRunRecordSchemas = [
  object({
    ...base,
    kind: { const: "rank_check_run_item", type: "string" },
    id: {
      type: "string",
      description: "Opaque retained run-item ID, identical to the run-items API.",
    },
    keyword_id: publicIdSchema("kw"),
    keyword: text,
    not_before: nullable(date),
    run_status: text,
    run_outcome: nullable(text),
    scope_membership: { const: "persisted_run_item", type: "string" },
  }),
  object({
    ...base,
    kind: { const: "rank_check_run", type: "string" },
    id: publicIdSchema("rcr"),
    planned_for: nullable(date),
    launched_at: nullable(date),
    outcome: nullable(text),
    trigger: text,
    selection_kind: text,
    scope_membership: { enum: ["persisted_run_items", "project_only"], type: "string" },
    counts: object({
      requested: integer,
      total: integer,
      completed: integer,
      failed: integer,
      deferred: integer,
      skipped: integer,
      cancelled: integer,
    }),
  }),
] as const;
