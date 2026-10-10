import {
  aiTrackingSuggestionResponseSchemas,
  aiTrackingSuggestionSnapshotSchema,
} from "./openapi-tracking-suggestions";

/** Neutral public AI tracking response schemas, aligned with the boundary projections. */
const text = { type: "string" };
const date = { type: "string", format: "date-time" };
const nullableDate = { type: ["string", "null"], format: "date-time" };
const nullableText = { type: ["string", "null"] };
const count = { type: "integer", minimum: 0 };
const flag = { type: "boolean" };
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const array = (items: object) => ({ type: "array", items });
const nullable = (schema: object) => ({ oneOf: [schema, { type: "null" }] });
const id = (prefix: string) => ({ type: "string", pattern: `^${prefix}_[a-z][a-z0-9]{23}$` });
const source = { type: "string", enum: ["consumer_scrape", "model_api", "google_aio"] };
const engine = { type: "string", enum: ["chat_gpt", "gemini", "claude", "perplexity", "google"] };
const measurement = {
  type: "string",
  enum: ["answer_present", "aio_not_present", "partial", "unavailable", "failed", "unknown"],
};
const costState = {
  type: "string",
  enum: ["unknown", "pending", "confirmed", "refund_pending", "derived"],
};
const usd = {
  type: ["string", "null"],
  pattern: "^\\d+(?:\\.\\d+)?$",
  description:
    "Decimal USD string from the provider cost receipt, or null when unknown. Never an invented zero.",
};
const configuration = object({
  provider: { const: "dataforseo" },
  endpoint: text,
  engine,
  source,
  model: nullableText,
  parameters: { type: "object", additionalProperties: true },
});
const topic = object({
  id: id("ait"),
  name: text,
  description: nullableText,
  paused_at: nullableDate,
  archived_at: nullableDate,
  created_at: date,
  updated_at: date,
});
const revision = object({
  id: id("apr"),
  category: { type: "string", enum: ["neutral", "comparative", "branded"] },
  ordinal: { type: "integer", minimum: 1 },
  text,
  text_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  created_at: date,
});
Object.assign(revision.properties, {
  generation_reference: object({
    generation_id: id("asg"),
    draft_id: { type: "string", format: "uuid" },
  }),
  provider_dataset_reference: object({
    report_id: id("agr"),
    row_index: { type: "integer", minimum: 0 },
  }),
});
const prompt = object({
  id: id("aip"),
  topic_id: nullable(id("ait")),
  label: nullableText,
  archived_at: nullableDate,
  paused_at: nullableDate,
  created_at: date,
  updated_at: date,
  revisions: array(revision),
});
const schedule = object({
  id: id("ais"),
  name: text,
  cron: text,
  timezone: text,
  enabled: flag,
  archived_at: nullableDate,
  next_run_at: nullableDate,
  configuration: object({ configurations: array(configuration), prompt_ids: array(id("aip")) }),
  created_at: date,
  updated_at: date,
});
const run = object({
  id: id("air"),
  state: {
    type: "string",
    enum: [
      "planned",
      "running",
      "completed",
      "partial",
      "blocked",
      "failed",
      "cancelled",
      "skipped",
    ],
  },
  created_at: date,
  updated_at: date,
  finished_at: nullableDate,
  planned_at: nullableDate,
  sample_count: { type: ["integer", "null"], minimum: 0 },
});
const preview = object({
  configurations: array(configuration),
  credential_connection_id: id("conn"),
  credential_version: text,
  budget_revision: text,
  consent_revision: text,
  estimated_cost_cents: { type: "number", minimum: 0 },
});
const citation = object({
  url: { type: "string", format: "uri" },
  title: nullableText,
  position: count,
});
const evidence = object({
  answer_text: nullableText,
  raw: { description: "Bounded provider evidence projection; null when unavailable." },
  answer_truncated: flag,
  raw_truncated: flag,
  search_results: array(citation),
  requested_locale: nullableText,
  effective_locale: nullableText,
  locale_mechanism: nullableText,
  requested_model: nullableText,
  actual_model: nullableText,
  provider_status: nullableText,
  observed_at: nullableDate,
  fetched_at: date,
  recorded_source: {
    type: "string",
    enum: ["fresh", "cache"],
    description:
      "Cached evidence keeps its original observation time and cannot become a fresh tracker sample.",
  },
});
const sample = object({
  id: id("asm"),
  measurement,
  source,
  engine,
  prompt: text,
  prompt_revision_id: id("apr"),
  evidence: nullable(evidence),
  citations: array(citation),
  cost_usd: usd,
  cost_state: costState,
});
const denominator = object({
  expected: count,
  observed: count,
  eligible: count,
  mentioned: count,
  absent_aio: count,
  partial: count,
  failed: count,
  unknown: count,
  missing: count,
  coverage: { type: "number", minimum: 0, maximum: 1 },
  mention_rate: { type: ["number", "null"], minimum: 0, maximum: 1 },
});
const trendComparison = {
  current: denominator,
  previous: denominator,
  comparable: flag,
  reason: nullableText,
  delta: { type: ["number", "null"] },
};
const trends = object(
  {
    current_run_id: id("air"),
    previous_run_id: id("air"),
    ...trendComparison,
    baseline: { const: "neutral" },
    category: { const: "neutral" },
    strata: array(
      object({
        category: { type: "string", enum: ["neutral", "comparative", "branded", "unknown"] },
        ...trendComparison,
      }),
    ),
    next_cursor: nullableText,
    previous_next_cursor: nullableText,
  },
  ["current_run_id", "baseline", "current", "comparable", "reason", "delta", "next_cursor"],
);
const draft = object({
  text,
  category: { type: "string", enum: ["neutral", "comparative", "branded"] },
  provenance: { type: "string", enum: ["generated_hypothesis", "provider_dataset"] },
  evidence_ids: array(text),
  popularity: { type: ["number", "null"] },
  accepted: { const: false },
});
const suggestions = object({
  input_snapshot: aiTrackingSuggestionSnapshotSchema,
  drafts: array(draft),
  method: { type: "string", enum: ["context_template_heuristic", "manual_fallback"] },
  context_updated_at: nullableDate,
  requires_acceptance: { const: true },
  cost_usd: { const: "0" },
  limitations: array(text),
});
const page = (resource: object) =>
  object({
    data: array(resource),
    meta: object({ next_cursor: nullableText }),
  });
const data = (resource: object) => object({ data: resource });

export const aiTrackingResponseSchemas = {
  ...aiTrackingSuggestionResponseSchemas,
  listAiTrackingTopics: page(topic),
  createAiTrackingTopic: data(topic),
  updateAiTrackingTopic: data(topic),
  archiveAiTrackingTopic: data(topic),
  listAiTrackingPrompts: page(prompt),
  createAiTrackingPrompt: data(prompt),
  updateAiTrackingPrompt: data(prompt),
  archiveAiTrackingPrompt: data(prompt),
  listAiTrackingSchedules: page(schedule),
  createAiTrackingSchedule: data(schedule),
  updateAiTrackingSchedule: data(schedule),
  archiveAiTrackingSchedule: data(schedule),
  previewAiTrackingRun: data(preview),
  createAiTrackingRun: data(run),
  listAiTrackingRuns: page(run),
  getAiTrackingRun: data(run),
  listAiTrackingSamples: page(sample),
  cancelAiTrackingRun: data(run),
  retryAiTrackingRun: data(run),
  getAiTrackingHistory: page(run),
  getAiTrackingTrends: data(trends),
  exportAiTrackingEvidence: data(
    object(
      {
        items: array(sample),
        run_id: id("air"),
        next_cursor: nullableText,
        scope: object({
          complete: { type: "boolean" },
          max_pages: { type: "integer", minimum: 1 },
          loaded: { type: "integer", minimum: 0 },
          resumed: { type: "boolean" },
        }),
      },
      ["items", "run_id", "next_cursor"],
    ),
  ),
  suggestAiTrackingPrompts: data(suggestions),
  acceptAiTrackingSuggestions: data(object({ prompts: array(prompt) })),
} as const;

export function aiTrackingResponseSchema(operationId: keyof typeof aiTrackingResponseSchemas) {
  return aiTrackingResponseSchemas[operationId];
}
