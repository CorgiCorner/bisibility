import { publicIdSchema } from "./openapi-public-id";
import { rankHistoryNormalizedItemSchema } from "./openapi-rank-history-normalized-items";
import { rankHistoryRunRecordSchemas } from "./openapi-rank-history-run-records";

const text = { type: "string" } as const;
const number = { type: "number" } as const;
const integer = { type: "integer", minimum: 0 } as const;
const date = { type: "string", format: "date-time" } as const;
const nullable = (value: object) => ({ anyOf: [value, { type: "null" }] });
const object = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
});
const array = (items: object) => ({ type: "array", items });
const keyword = publicIdSchema("kw");
const check = publicIdSchema("check");
const reference = nullable(
  object({
    comparison_digest: nullable(text),
    evidence: text,
    freshness: text,
    freshness_reason: nullable(text),
    id: check,
    normalization_version: nullable(text),
    observed_at: nullable(date),
    position: nullable(number),
    provider: nullable(text),
    ranking_url: nullable(text),
    reason: nullable(text),
    recorded_at: date,
    reported_position: nullable(number),
    requested_depth: nullable(integer),
  }),
);
const scope = nullable(
  object({
    device: text,
    engine: text,
    identity_revision: nullable(text),
    language: text,
    location: text,
    policy_revision: nullable(text),
    rank_scale: text,
    result_kind: text,
    surface: text,
    target_revision: nullable(text),
  }),
);
const resolution = object({
  baseline: reference,
  comparison: text,
  comparison_boundary: nullable(object({ point: reference, reason: text })),
  comparison_window: nullable(object({ before: date, not_before: nullable(date) })),
  comparison_unavailable_reason: nullable(text),
  current: reference,
  event: nullable(text),
  keyword_id: keyword,
  last_success: reference,
  latest_attempt: nullable(
    object({
      id: check,
      measurement_recorded_at: date,
      observed_at: nullable(date),
      recorded_at: nullable(date),
      status: text,
    }),
  ),
  movement: nullable(number),
});
const counts = object({
  expected: integer,
  measured: integer,
  metric_eligible: integer,
  ranked: integer,
  known_absent: integer,
  unknown: integer,
  never_checked: integer,
  failed: integer,
  stale: integer,
  unsupported: integer,
  fresh_determinate: nullable(integer),
  unknown_freshness: integer,
  comparable: integer,
});
const metric = object({
  metric_id: text,
  definition_version: text,
  as_of: date,
  value: nullable(number),
  delta: nullable(number),
  counts,
  data_coverage: nullable(number),
  observed_coverage: nullable(number),
  freshness: text,
  freshness_reason: nullable(text),
  imputed_weight_share: nullable(number),
  contributions: array(
    object({
      target_id: keyword,
      weight: number,
      value: nullable(number),
      delta: nullable(number),
    }),
  ),
  exclusions: array(object({ target_id: keyword, reason: text })),
  added: nullable(array(keyword)),
  removed: nullable(array(keyword)),
  composition_reason: nullable(text),
  weight_provenance: object({
    source: nullable(text),
    period: nullable(text),
    market: nullable(text),
  }),
  included_count: integer,
  eligible_total: integer,
  is_truncated: { type: "boolean" },
});
const summary = object({
  comparison: text,
  metric,
  movement_counts: nullable(
    object({
      improved: integer,
      declined: integer,
      entered: integer,
      exited: integer,
      first: integer,
      moved: integer,
      re_entered: integer,
      steady: integer,
      unknown: integer,
    }),
  ),
  retained_history: object({
    checks: integer,
    completeness: { const: "retained_only", type: "string" },
    targets: integer,
  }),
  selection_digest: text,
  time_basis: object({
    as_of: date,
    baseline: nullable(object({ before: date, not_before: nullable(date) })),
    current_not_before: nullable(date),
  }),
});
const times = {
  checked_at: date,
  check_recorded_at: date,
  observed_at: nullable(date),
  recorded_at: date,
  requested_at: nullable(date),
};
const observation = object({
  ...times,
  comparison_digest: nullable(text),
  complete_through: nullable(integer),
  completeness: text,
  configured_scope: scope,
  effective_scope: scope,
  evidence: text,
  expected_url_at_check: nullable(text),
  freshness: text,
  freshness_as_of: date,
  freshness_reason: nullable(text),
  id: check,
  keyword_id: keyword,
  keyword: text,
  normalization_version: nullable(text),
  position: nullable(number),
  provider: nullable(text),
  ranking_url: nullable(text),
  reason: nullable(text),
  reported_position: nullable(number),
  requested_depth: nullable(integer),
  normalized_items: array(rankHistoryNormalizedItemSchema),
  normalized_item_count: integer,
});
const attempt = object({
  ...times,
  deferred_reason: nullable(text),
  error_code: nullable(text),
  finished_at: nullable(date),
  id: check,
  keyword_id: keyword,
  keyword: text,
  kind: { const: "logical_rank_check", type: "string" },
  provider: nullable(text),
  reported_provider_attempt_count: integer,
  started_at: nullable(date),
  status: text,
});

/** Field-level source contract; enums from historical providers remain forward-compatible strings. */
export const rankHistoryReportSchemas = {
  RankHistoryReportRecord: { oneOf: [observation, attempt, ...rankHistoryRunRecordSchemas] },
  RankHistoryReportMetadata: object({
    version: { const: 2, type: "integer" },
    aggregation: { const: "none", type: "string" },
    as_of: date,
    window: object({
      basis: { enum: ["observed_at", "recorded_at"], type: "string" },
      from: date,
      to: date,
    }),
    summary_basis: { const: "current_definition_as_of_registered_baseline", type: "string" },
    definition_version: text,
    metric_id: text,
    selection_digest: text,
    total_count: integer,
    excluded_unknown_time: integer,
    unresolved_membership_count: {
      ...integer,
      description:
        "No-check runs omitted from a selected/filtered export because retained keyword membership cannot be proved. Project-only runs remain in full-project exports.",
    },
    normalized_items: object({
      total_count: integer,
      completeness: { const: "retained_only", type: "string" },
      is_truncated: { const: false, type: "boolean" },
      capacity: integer,
      paging: { const: "observation_pages_only", type: "string" },
    }),
    membership: {
      type: "string",
      description:
        "Explicit membership policy: full project retained history, explicit selected retained history, or current active filtered query.",
    },
    summary,
    resolutions: array(
      object({ ...resolution.properties, current_scope_state: text, last_known: resolution }),
    ),
  }),
  RankHistoryReportResponse: object({
    data: array({ $ref: "#/components/schemas/RankHistoryReportRecord" }),
    meta: object({
      next_cursor: nullable(text),
      report: { $ref: "#/components/schemas/RankHistoryReportMetadata" },
    }),
  }),
} as const;
