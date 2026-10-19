import { sdkName, taggedUnion, usdCents, usdNumber } from "./openapi-sdk-schema";

const costCount = { minimum: 0, type: "number" } as const;
const nullableCostCount = { minimum: 0, type: ["number", "null"] } as const;

/** Rank-check volume and spend fields shared by both pricing models (lib/cost-estimate/api-estimate.ts estimateForQuery). */
const costEstimateBase = {
  properties: {
    billing_units_per_check: costCount,
    checks_per_run: costCount,
    depth: { minimum: 1, type: "integer" },
    effective_cost_per_check_cents: { ...nullableCostCount, ...usdCents },
    exceeds_largest_plan: { type: "boolean" },
    exceeds_selected_plan: { type: "boolean" },
    monthly_billing_units: nullableCostCount,
    monthly_checks: nullableCostCount,
    monthly_cost_cents: { ...nullableCostCount, ...usdCents },
    monthly_cost_usd: { ...nullableCostCount, ...usdNumber },
    pricing_model: { type: "string" },
    provider_id: { type: "string" },
    rate_checked_at: { type: "string" },
    rate_source_url: { type: "string" },
    result_pages_per_run: costCount,
    runs_per_month: nullableCostCount,
  },
  required: [
    "billing_units_per_check",
    "checks_per_run",
    "depth",
    "effective_cost_per_check_cents",
    "exceeds_largest_plan",
    "exceeds_selected_plan",
    "monthly_billing_units",
    "monthly_checks",
    "monthly_cost_cents",
    "monthly_cost_usd",
    "pricing_model",
    "provider_id",
    "rate_checked_at",
    "rate_source_url",
    "result_pages_per_run",
    "runs_per_month",
  ],
  type: "object",
} as const;

const selectedCostOption = {
  properties: {
    additional_page_cost_cents: { ...costCount, ...usdCents },
    additional_page_cost_usd: { ...costCount, ...usdNumber },
    key: { type: "string" },
    label: { type: "string" },
    short_label: { type: "string" },
    top_100_check_cost_cents: { ...costCount, ...usdCents },
    top_100_check_cost_usd: { ...costCount, ...usdNumber },
    turnaround: { type: "string" },
    unit_cost_cents: { ...costCount, ...usdCents },
    unit_cost_usd: { ...costCount, ...usdNumber },
  },
  required: [
    "additional_page_cost_cents",
    "additional_page_cost_usd",
    "key",
    "label",
    "short_label",
    "top_100_check_cost_cents",
    "top_100_check_cost_usd",
    "turnaround",
    "unit_cost_cents",
    "unit_cost_usd",
  ],
  type: "object",
  ...sdkName("CostEstimateOption"),
} as const;

const selectedCostPlan = {
  properties: {
    included_checks: costCount,
    label: { type: "string" },
    monthly_price_cents: { ...costCount, ...usdCents },
    monthly_price_usd: { ...costCount, ...usdNumber },
    plan_key: { type: "string" },
  },
  required: ["included_checks", "label", "monthly_price_cents", "monthly_price_usd", "plan_key"],
  type: "object",
  ...sdkName("CostEstimatePlan"),
} as const;

/**
 * Flat-rate providers may report the selected option; plan providers may report the selected
 * plan, which is omitted when the frequency has no scheduled runs (lib/cost-estimate/api-estimate.ts).
 */
export const costEstimateSchema = {
  anyOf: [
    {
      ...costEstimateBase,
      properties: {
        ...costEstimateBase.properties,
        pricing_model: { const: "flat", type: "string" },
        selected_option: selectedCostOption,
      },
      ...sdkName("FlatCostEstimate"),
    },
    {
      ...costEstimateBase,
      properties: {
        ...costEstimateBase.properties,
        pricing_model: { const: "plan", type: "string" },
        selected_plan: selectedCostPlan,
      },
      ...sdkName("PlanCostEstimate"),
    },
    { ...costEstimateBase, ...sdkName("OtherCostEstimate") },
  ],
  description: "Estimated rank-check volume and provider spend for a keyword portfolio.",
  ...taggedUnion("pricing_model", ["flat", "plan", "other"]),
};
