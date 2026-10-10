const text = { type: "string" };
const date = { type: "string", format: "date-time" };
const number = { type: "number" };
const flag = { type: "boolean" };
const opaque = { type: "object", additionalProperties: true };
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
});
const array = (items: object) => ({ type: "array", items });
const reportSummary = object({ id: text, title: text, kind: text, created_at: date });
const report = object({ ...reportSummary.properties, body: opaque, provenance: opaque });
const context = object({
  business: text,
  audience: text,
  products: text,
  goals: text,
  agent_rules: text,
  updated_at: { type: ["string", "null"], format: "date-time" },
});
const citation = object({
  title: text,
  url: { type: "string", format: "uri" },
  target_domain: flag,
});
const aiRow = object(
  {
    prompt: text,
    model: text,
    requested_model: text,
    actual_model: { type: ["string", "null"] },
    answer: text,
    observed_at: { type: ["string", "null"] },
    brand_mentioned: flag,
    domain_cited: flag,
    citations: array(citation),
    content_truncated: flag,
  },
  ["prompt", "model", "answer", "observed_at", "brand_mentioned", "domain_cited", "citations"],
);
const evidence = { type: "string", enum: ["observed_dataset", "synthetic_prompt_test"] };
const aiResult = object({
  evidence,
  rows: array(aiRow),
  total_available: { type: ["integer", "null"] },
  truncated: flag,
  fetched_at: date,
  cost_cents: number,
  cost_status: { type: "string", enum: ["confirmed", "unknown"] },
  failure: { type: ["string", "null"] },
});
const aiOutcome = {
  oneOf: [
    object(
      {
        ok: { const: true },
        estimate: { const: true },
        estimated_cost_cents: number,
        estimate_kind: { type: "string", enum: ["forecast", "admission_bound"] },
        is_guaranteed_maximum: flag,
        credential_source: { type: "string", enum: ["own", "hosted"] },
        estimate_credentials_ref: text,
        is_partial_estimate: flag,
        pricing_policy: {
          type: "string",
          enum: ["legacy_dated", "current_catalog", "provider_actual_cost"],
        },
        pricing_checked_at: {
          oneOf: [
            { type: "string", format: "date" },
            { type: "string", format: "date-time" },
          ],
        },
        forecast_exclusions: array(text),
        forecast_scope: { const: "tokens_and_base_only" },
        forecast_assumptions: array(text),
        evidence,
      },
      [
        "ok",
        "estimate",
        "estimated_cost_cents",
        "evidence",
        "estimate_kind",
        "is_guaranteed_maximum",
        "credential_source",
        "estimate_credentials_ref",
      ],
    ),
    object(
      {
        ok: { const: true },
        estimate: { const: false },
        cached: flag,
        report_id: text,
        cost_cents: number,
        result: aiResult,
        retry_blocked: flag,
      },
      ["ok", "estimate", "cached", "report_id", "cost_cents", "result"],
    ),
  ],
};
const namedChoice = object({ code: text, name: text });
const aiCatalog = object({
  models: array(
    object({
      id: text,
      provider: { const: "chat_gpt" },
      label: text,
      reasoning: flag,
      web_search: flag,
      min_output_tokens: number,
      max_output_tokens: number,
      price_available: {
        ...flag,
        description:
          "Fresh official token unit prices are available. This does not imply a complete request/search cost ceiling.",
      },
      admission_enabled: {
        ...flag,
        description:
          "The model ID is enabled by the current billing policy. Known prices alone do not enable additional model IDs.",
      },
      actual_cost_enabled: {
        ...flag,
        description:
          "Fresh token and base forecast available for explicit own-BYOK actual-cost mode, without a guaranteed maximum.",
      },
    }),
  ),
  visibility_markets: array(
    object({
      platform: { type: "string", enum: ["chat_gpt", "google"] },
      location_code: number,
      country_name: text,
      languages: array(namedChoice),
    }),
  ),
  response_countries: {
    ...array(namedChoice),
    description:
      "Bundled ISO country names for optional search hints, not observed dataset coverage.",
  },
  response_languages: {
    ...array(namedChoice),
    description: "Local language names for answer instructions, not native provider filters.",
  },
  limits: object({ max_models: { const: 2 }, max_output_tokens: { const: 4096 } }),
  fetched_at: date,
  actual_cost_available: {
    ...flag,
    description:
      "The project currently uses own provider credentials. This is rechecked authoritatively before paid execution.",
  },
});
const issue = object({
  code: text,
  severity: { type: "string", enum: ["error", "warning", "info"] },
  message: text,
});
const nullableText = { type: ["string", "null"] };
const auditPage = object({
  url: text,
  final_url: text,
  status: { type: ["integer", "null"] },
  response_time_ms: number,
  title: nullableText,
  description: nullableText,
  canonical: nullableText,
  headings: array(object({ level: { type: "integer" }, text })),
  h1_count: number,
  indexable: flag,
  robots: nullableText,
  internal_link_count: number,
  external_link_count: number,
  internal_links: array(text),
  image_count: number,
  missing_alt_count: number,
  issues: array(issue),
});
const auditResult = object({
  version: { const: 1 },
  target: text,
  started_at: date,
  completed_at: date,
  state: { type: "string", enum: ["complete", "partial"] },
  stop_reason: { type: "string", enum: ["finished", "page_limit", "time_limit", "request_limit"] },
  limits: object({
    max_pages: number,
    max_requests: number,
    max_duration_ms: number,
    max_page_bytes: number,
  }),
  requests: number,
  pages: array(auditPage),
  summary: object({ pages: number, errors: number, warnings: number, indexable: number }),
  limitations: array(text),
});
const audit = object({ id: text, created_at: date, cached: flag, result: auditResult });

export function researchWorkspaceResponse(operationId: string) {
  if (operationId === "listAgentReports")
    return object({ data: array(reportSummary), meta: object({ next_cursor: nullableText }) });
  let data: object;
  if (operationId === "getAiResearchCatalog") data = aiCatalog;
  else if (operationId.endsWith("ProjectContext")) data = context;
  else if (operationId === "listSiteAudits") data = array(reportSummary);
  else if (["runSiteAudit", "getSiteAudit"].includes(operationId)) data = audit;
  else if (["analyzeAiVisibility", "compareAiPrompts"].includes(operationId)) data = aiOutcome;
  else data = report;
  return object({ data });
}
