import "server-only";

import type { FlatRateOption, ProviderPlan, ProviderRate } from "@/lib/cost-estimate/estimate";
import { estimateCost, flatPerCheckCostCents } from "@/lib/cost-estimate/estimate";
import { PROVIDER_RATES, rateForProvider } from "@/lib/cost-estimate/provider-rates";
import { centsToDollars } from "@/lib/format/currency";
import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";
import { ZodError, z } from "zod";
import type { ApiContext } from "./context";
import { dataResponse, errorResponse } from "./responses";

type AnonymousContext = Pick<ApiContext, "headers">;

export const COST_ESTIMATE_MAX_KEYWORDS = 100_000;
export const COST_ESTIMATE_MAX_LOCATIONS = 100;

const querySchema = z.object({
  depth: z.coerce.number().pipe(serpDepthSchema).default(DEFAULT_SERP_DEPTH),
  devices: z.coerce.number().int().min(1).max(2).default(1),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  keywords: z.coerce.number().int().min(0).max(COST_ESTIMATE_MAX_KEYWORDS),
  locations: z.coerce.number().int().min(1).max(COST_ESTIMATE_MAX_LOCATIONS).default(1),
  option: z.string().trim().min(1).optional(),
  plan: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).default("dataforseo"),
});

function instance(req: Request) {
  return `urn:bisibility:api:v1:${new URL(req.url).pathname}`;
}

function queryValue(params: URLSearchParams, key: string) {
  return params.get(key) ?? undefined;
}

function costQuery(req: Request) {
  const params = new URL(req.url).searchParams;

  return querySchema.parse({
    devices: queryValue(params, "devices"),
    depth: queryValue(params, "depth"),
    frequency: queryValue(params, "frequency"),
    keywords: queryValue(params, "keywords"),
    locations: queryValue(params, "locations"),
    option: queryValue(params, "option"),
    plan: queryValue(params, "plan"),
    provider: queryValue(params, "provider"),
  });
}

function optionResponse(option: FlatRateOption) {
  const perCheckCostCents = flatPerCheckCostCents(option, DEFAULT_SERP_DEPTH);
  return {
    additional_page_cost_cents: option.additionalPageCostCents,
    additional_page_cost_usd: centsToDollars(option.additionalPageCostCents),
    key: option.key,
    label: option.label,
    short_label: option.shortLabel,
    turnaround: option.turnaround,
    top_100_check_cost_cents: perCheckCostCents,
    top_100_check_cost_usd: centsToDollars(perCheckCostCents),
    unit_cost_cents: option.unitCostCents,
    unit_cost_usd: centsToDollars(option.unitCostCents),
  };
}

function planResponse(plan: ProviderPlan) {
  return {
    included_checks: plan.includedChecks,
    label: plan.label,
    monthly_price_cents: plan.monthlyPriceCents,
    monthly_price_usd: centsToDollars(plan.monthlyPriceCents),
    plan_key: plan.planKey,
  };
}

function providerRateResponse(rate: ProviderRate) {
  return {
    checked_at: rate.checkedAt,
    label: rate.label,
    notes: rate.notes,
    provider_id: rate.providerId,
    pricing_model: rate.pricingModel,
    source_url: rate.sourceUrl,
    ...(rate.pricingModel === "flat"
      ? { options: rate.options.map(optionResponse) }
      : { plans: rate.plans.map(planResponse) }),
  };
}

export function getProviderRates(ctx: AnonymousContext) {
  return dataResponse(PROVIDER_RATES.map(providerRateResponse), { headers: ctx.headers });
}

export function getCostEstimate(req: Request, ctx: AnonymousContext) {
  let query: z.infer<typeof querySchema>;

  try {
    query = costQuery(req);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("validation_failed", "Request input failed validation.", 400, {
        details: z.flattenError(error),
        headers: ctx.headers,
        instance: instance(req),
      });
    }

    throw error;
  }

  const rate = rateForProvider(query.provider);
  if (!rate) {
    return errorResponse("not_found", "Provider rate not found.", 404, {
      headers: ctx.headers,
      instance: instance(req),
    });
  }

  const estimate = estimateCost(
    {
      depth: query.depth,
      deviceCount: query.devices,
      frequency: query.frequency,
      keywordCount: query.keywords,
      locationCount: query.locations,
    },
    rate,
    { optionKey: query.option, planKey: query.plan },
  );

  return dataResponse(
    {
      checks_per_run: estimate.checksPerRun,
      depth: query.depth,
      billing_units_per_check: estimate.billingUnitsPerCheck,
      effective_cost_per_check_cents: estimate.effectiveCostPerCheckCents,
      exceeds_largest_plan: estimate.exceedsLargestPlan,
      exceeds_selected_plan: estimate.exceedsSelectedPlan,
      monthly_checks: estimate.monthlyChecks,
      monthly_billing_units: estimate.monthlyBillingUnits,
      monthly_cost_cents: estimate.monthlyCostCents,
      monthly_cost_usd: centsToDollars(estimate.monthlyCostCents),
      provider_id: rate.providerId,
      pricing_model: rate.pricingModel,
      rate_checked_at: rate.checkedAt,
      rate_source_url: rate.sourceUrl,
      ...(estimate.selectedOption
        ? { selected_option: optionResponse(estimate.selectedOption) }
        : {}),
      ...(estimate.selectedPlan ? { selected_plan: planResponse(estimate.selectedPlan) } : {}),
    },
    { headers: ctx.headers },
  );
}
