import { openEnum, sdkName, usdCents } from "./openapi-sdk-schema";
import {
  trackingEngineSchema as engine,
  trackingSampleSchema as sample,
  trackingSourceSchema as source,
  trackingRawEvidenceSchema,
} from "./openapi-tracking-evidence";
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
const named = <T extends object>(name: string, schema: T) => ({ ...schema, ...sdkName(name) });
const component = (name: string): { $ref: string } => ({
  $ref: `#/components/schemas/${name}`,
});
const promptCategory = {
  type: "string",
  enum: ["neutral", "comparative", "branded"],
  ...openEnum("AiTrackingPromptCategory"),
};
const array = (items: object) => ({ type: "array", items });
const nullable = (schema: object) => ({ oneOf: [schema, { type: "null" }] });
const id = (prefix: string) => ({ type: "string", pattern: `^${prefix}_[a-z][a-z0-9]{23}$` });
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
  category: promptCategory,
  ordinal: { type: "integer", minimum: 1 },
  text,
  text_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  created_at: date,
});
Object.assign(revision.properties, {
  generation_reference: named(
    "AiTrackingPromptGenerationReference",
    object({ generation_id: id("asg"), draft_id: { type: "string", format: "uuid" } }),
  ),
  provider_dataset_reference: named(
    "AiTrackingPromptDatasetReference",
    object({ report_id: id("agr"), row_index: { type: "integer", minimum: 0 } }),
  ),
});
const prompt = object({
  id: id("aip"),
  topic_id: nullable(id("ait")),
  label: nullableText,
  archived_at: nullableDate,
  paused_at: nullableDate,
  created_at: date,
  updated_at: date,
  revisions: array(named("AiTrackingPromptRevision", revision)),
});
const schedule = object({
  id: id("ais"),
  name: text,
  cron: text,
  timezone: text,
  enabled: flag,
  archived_at: nullableDate,
  next_run_at: nullableDate,
  configuration: object({
    configurations: array(named("AiTrackingConfiguration", configuration)),
    prompt_ids: array(id("aip")),
  }),
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
    ...openEnum("AiTrackingRunState"),
  },
  created_at: date,
  updated_at: date,
  finished_at: nullableDate,
  planned_at: nullableDate,
  sample_count: { type: ["integer", "null"], minimum: 0 },
});
const preview = object({
  configurations: array(named("AiTrackingConfiguration", configuration)),
  credential_connection_id: id("conn"),
  credential_version: text,
  budget_revision: text,
  consent_revision: text,
  estimated_cost_cents: { ...usdCents, type: "number", minimum: 0 },
});
const denominator = named("AiTrackingTrendCounts", {
  ...object({
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
  }),
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
      named(
        "AiTrackingTrendStratum",
        object({
          category: {
            type: "string",
            enum: ["neutral", "comparative", "branded", "unknown"],
            ...openEnum("AiTrackingTrendCategory"),
          },
          ...trendComparison,
        }),
      ),
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
    meta: named("AiTrackingPageMeta", object({ next_cursor: nullableText })),
  });
const data = (resource: object) => object({ data: resource });

/** App-owned AI tracking components; the MCP contract has no say in these shapes. */
export const aiTrackingComponentSchemas = {
  AiTrackingRawEvidence: trackingRawEvidenceSchema,
  AiTrackingPrompt: prompt,
  AiTrackingPromptPage: page({ $ref: "#/components/schemas/AiTrackingPrompt" }),
  AiTrackingRun: run,
  AiTrackingRunResponse: data(component("AiTrackingRun")),
  AiTrackingRunPreviewResponse: data(named("AiTrackingRunPreview", preview)),
  AiTrackingSamplePage: page(named("AiTrackingSample", sample)),
  AiTrackingRunPage: page({ $ref: "#/components/schemas/AiTrackingRun" }),
  AiTrackingTrends: trends,
  AiTrackingTrendsResponse: data({ $ref: "#/components/schemas/AiTrackingTrends" }),
};

export const aiTrackingResponseSchemas = {
  ...aiTrackingSuggestionResponseSchemas,
  listAiTrackingTopics: page(topic),
  createAiTrackingTopic: data(topic),
  updateAiTrackingTopic: data(topic),
  archiveAiTrackingTopic: data(topic),
  listAiTrackingPrompts: component("AiTrackingPromptPage"),
  createAiTrackingPrompt: data(component("AiTrackingPrompt")),
  updateAiTrackingPrompt: data(component("AiTrackingPrompt")),
  archiveAiTrackingPrompt: data(component("AiTrackingPrompt")),
  listAiTrackingSchedules: page(schedule),
  createAiTrackingSchedule: data(schedule),
  updateAiTrackingSchedule: data(schedule),
  archiveAiTrackingSchedule: data(schedule),
  previewAiTrackingRun: component("AiTrackingRunPreviewResponse"),
  createAiTrackingRun: component("AiTrackingRunResponse"),
  listAiTrackingRuns: component("AiTrackingRunPage"),
  getAiTrackingRun: component("AiTrackingRunResponse"),
  listAiTrackingSamples: component("AiTrackingSamplePage"),
  cancelAiTrackingRun: data(component("AiTrackingRun")),
  retryAiTrackingRun: data(component("AiTrackingRun")),
  getAiTrackingHistory: component("AiTrackingRunPage"),
  getAiTrackingTrends: component("AiTrackingTrendsResponse"),
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
  acceptAiTrackingSuggestions: data(object({ prompts: array(component("AiTrackingPrompt")) })),
} as const;

export function aiTrackingResponseSchema(operationId: keyof typeof aiTrackingResponseSchemas) {
  return aiTrackingResponseSchemas[operationId];
}
