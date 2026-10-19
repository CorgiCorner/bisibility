import { openEnum, sdkName, usdDecimal } from "./openapi-sdk-schema";

const text = { type: "string" };
const date = { type: "string", format: "date-time" };
const nullableDate = { type: ["string", "null"], format: "date-time" };
const nullableText = { type: ["string", "null"] };
const count = { type: "integer", minimum: 0 };
const flag = { type: "boolean" };
const object = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const named = <T extends object>(name: string, schema: T) => ({ ...schema, ...sdkName(name) });
const array = (items: object) => ({ type: "array", items });
const nullable = (schema: object) => ({ oneOf: [schema, { type: "null" }] });
const id = (prefix: string) => ({ type: "string", pattern: `^${prefix}_[a-z][a-z0-9]{23}$` });

export const trackingSourceSchema = {
  ...openEnum("AiTrackingSource"),
  type: "string",
  enum: ["consumer_scrape", "model_api", "google_aio"],
};
export const trackingEngineSchema = {
  ...openEnum("AiTrackingEngine"),
  type: "string",
  enum: ["chat_gpt", "gemini", "claude", "perplexity", "google"],
};
const measurement = {
  ...openEnum("AiTrackingMeasurement"),
  type: "string",
  enum: ["answer_present", "aio_not_present", "partial", "unavailable", "failed", "unknown"],
};
const costState = {
  ...openEnum("AiTrackingCostState"),
  type: "string",
  enum: ["unknown", "pending", "confirmed", "refund_pending", "derived"],
};
const usd = {
  ...usdDecimal,
  type: ["string", "null"],
  pattern: "^\\d+(?:\\.\\d+)?$",
  description:
    "Decimal USD string from the provider cost receipt, or null when unknown. Never an invented zero.",
};
const citation = named(
  "AiTrackingCitation",
  object({
    url: { type: "string", format: "uri" },
    title: nullableText,
    position: count,
  }),
);
export const trackingRawEvidenceSchema = {
  type: ["object", "string", "null"],
  additionalProperties: true,
  description:
    "Bounded provider evidence containing arbitrary provider JSON fields and nested values. " +
    "Usually an object with status_code and result; oversized evidence can be a JSON text " +
    "preview or an object with truncated and preview. Null when unavailable. " +
    "Provider keys and values are preserved without case conversion.",
};
const evidence = object({
  answer_text: nullableText,
  raw: { $ref: "#/components/schemas/AiTrackingRawEvidence" },
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
    ...openEnum("AiTrackingRecordedSource"),
    description:
      "Cached evidence keeps its original observation time and cannot become a fresh tracker sample.",
  },
});
export const trackingSampleSchema = object({
  id: id("asm"),
  measurement,
  source: trackingSourceSchema,
  engine: trackingEngineSchema,
  prompt: text,
  prompt_revision_id: id("apr"),
  evidence: { ...nullable(evidence), ...sdkName("AiTrackingEvidence") },
  citations: array(citation),
  cost_usd: usd,
  cost_state: costState,
});
