const text = { type: "string" };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: unknown) => ({ type: "array", items });
const id = (prefix: string) => ({ type: "string", pattern: `^${prefix}_[a-z][a-z0-9]{23}$` });
const configuration = object({
  provider: { const: "dataforseo" },
  engine: { const: "chat_gpt" },
  model: text,
  language_code: text,
  max_output_tokens: { type: "integer", minimum: 16, maximum: 4096 },
  advisory_cost_limit_cents: { type: "number", exclusiveMinimum: 0, maximum: 1000000 },
});
(configuration.properties as Record<string, unknown>).country_iso_code = {
  type: "string",
  pattern: "^[A-Z]{2}$",
};
export const aiTrackingSuggestionSnapshotSchema = object({
  context: object({
    business: text,
    audience: text,
    products: text,
    goals: text,
    agent_rules: text,
  }),
  competitors: array(object({ id: id("cmp"), label: { type: ["string", "null"] }, domain: text })),
});
export const aiTrackingSuggestionPreviewSchema = object({
  version: { const: 1 },
  configuration,
  input_snapshot: aiTrackingSuggestionSnapshotSchema,
  snapshot_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  estimated_cost_cents: { type: "number", exclusiveMinimum: 0 },
  estimate_kind: { const: "forecast" },
  is_guaranteed_maximum: { const: false },
  credential_connection_id: id("conn"),
  credential_version: text,
  budget_revision: text,
  consent_revision: text,
  expires_at: { type: "string", format: "date-time" },
  limitations: array(text),
});
export const aiTrackingSuggestionGenerationSchema = object({
  generation_id: id("asg"),
  drafts: array(
    object({
      draft_id: { type: "string", format: "uuid" },
      text,
      category: { type: "string", enum: ["neutral", "comparative", "branded"] },
      provenance: { const: "model_generated_hypothesis" },
      evidence_ids: { type: "array", maxItems: 0 },
      popularity: { type: "null" },
      accepted: { const: false },
    }),
  ),
  cost_usd: { type: ["string", "null"], pattern: "^\\d+(?:\\.\\d+)?$" },
  cost_state: { type: "string", enum: ["unknown", "confirmed"] },
  method: { const: "model_generated_hypothesis" },
  limitations: array(text),
});
export const aiTrackingSuggestionResponseSchemas = {
  aiTrackingSuggestionsPreview: object({ data: aiTrackingSuggestionPreviewSchema }),
  aiTrackingSuggestionsGenerate: object({ data: aiTrackingSuggestionGenerationSchema }),
};
