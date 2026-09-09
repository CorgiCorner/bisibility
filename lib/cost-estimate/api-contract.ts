import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { z } from "zod";
import type { CostEstimate } from "./estimate";

export const COST_ESTIMATE_MAX_KEYWORDS = 100_000;
export const COST_ESTIMATE_MAX_LOCATIONS = 100;
export const costEstimateFrequencies = [
  "daily",
  "weekly",
  "monthly",
  "manual",
  "paused",
  "custom_cron",
] as const;

export const costEstimateQuerySchema = z.object({
  cron_expression: z.string().trim().max(120).optional(),
  depth: z.coerce.number().pipe(serpDepthSchema).default(DEFAULT_SERP_DEPTH),
  devices: z.coerce.number().int().min(1).max(2).default(1),
  frequency: z.enum(costEstimateFrequencies).default("daily"),
  keywords: z.coerce.number().int().min(0).max(COST_ESTIMATE_MAX_KEYWORDS),
  locations: z.coerce.number().int().min(1).max(COST_ESTIMATE_MAX_LOCATIONS).default(1),
  option: z.string().trim().min(1).max(80).optional(),
  plan: z.string().trim().min(1).max(80).optional(),
  provider: z.string().trim().min(1).max(80).default("dataforseo"),
});
export type CostEstimateQuery = z.infer<typeof costEstimateQuerySchema>;

const count = z.number().nonnegative();
export const costEstimateDataSchema = z.object({
  checks_per_run: count,
  depth: serpDepthSchema,
  billing_units_per_check: count,
  result_pages_per_run: count,
  runs_per_month: count.nullable(),
  monthly_checks: count.nullable(),
  monthly_billing_units: count.nullable(),
  monthly_cost_cents: count.nullable(),
  monthly_cost_usd: count.nullable(),
  effective_cost_per_check_cents: count.nullable(),
  exceeds_largest_plan: z.boolean(),
  exceeds_selected_plan: z.boolean(),
  provider_id: z.string(),
  pricing_model: z.enum(["flat", "plan"]),
  rate_checked_at: z.string(),
  rate_source_url: z.string(),
  selected_option: z
    .object({
      key: z.string(),
      label: z.string(),
      short_label: z.string(),
      turnaround: z.string(),
      unit_cost_cents: count,
      additional_page_cost_cents: count,
    })
    .optional(),
  selected_plan: z
    .object({
      plan_key: z.string(),
      label: z.string(),
      monthly_price_cents: count,
      included_checks: count,
    })
    .optional(),
});
export type CostEstimateData = z.infer<typeof costEstimateDataSchema>;

export type CostEstimateInput = {
  keywordCount: number;
  locationCount: number;
  deviceCount: number;
  depth: SerpDepth;
  frequency: RankCheckFrequency;
  cronExpression?: string | null;
  providerId?: string;
  optionKey?: string;
  planKey?: string;
};

export function costEstimateHref(input: CostEstimateInput): string | null {
  if (input.keywordCount <= 0 || input.locationCount <= 0 || input.deviceCount <= 0) return null;
  const params = new URLSearchParams({
    keywords: String(input.keywordCount),
    locations: String(input.locationCount),
    devices: String(input.deviceCount),
    depth: String(input.depth),
    frequency: input.frequency,
    provider: input.providerId ?? "dataforseo",
    option: input.optionKey ?? "live",
  });
  if (input.planKey && input.planKey !== "auto") params.set("plan", input.planKey);
  if (input.frequency === "custom_cron" && input.cronExpression)
    params.set("cron_expression", input.cronExpression);
  return `/api/v1/cost-estimate?${params}`;
}

export function pricedEstimate(data: CostEstimateData): CostEstimate | null {
  if (
    data.monthly_checks === null ||
    data.monthly_billing_units === null ||
    data.monthly_cost_cents === null ||
    data.effective_cost_per_check_cents === null
  )
    return null;
  const option = data.selected_option;
  const plan = data.selected_plan;
  return {
    checksPerRun: data.checks_per_run,
    billingUnitsPerCheck: data.billing_units_per_check,
    monthlyChecks: data.monthly_checks,
    monthlyBillingUnits: data.monthly_billing_units,
    monthlyCostCents: data.monthly_cost_cents,
    effectiveCostPerCheckCents: data.effective_cost_per_check_cents,
    exceedsLargestPlan: data.exceeds_largest_plan,
    exceedsSelectedPlan: data.exceeds_selected_plan,
    selectedOption: option
      ? {
          key: option.key,
          label: option.label,
          shortLabel: option.short_label,
          turnaround: option.turnaround,
          unitCostCents: option.unit_cost_cents,
          additionalPageCostCents: option.additional_page_cost_cents,
        }
      : null,
    selectedPlan: plan
      ? {
          planKey: plan.plan_key,
          label: plan.label,
          monthlyPriceCents: plan.monthly_price_cents,
          includedChecks: plan.included_checks,
        }
      : null,
  };
}
