import { centsToDollars } from "@/lib/format/currency";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import type { CostEstimateData, CostEstimateQuery } from "./api-contract";
import {
  estimateCost,
  type FlatRateOption,
  flatPerCheckCostCents,
  frequencyFromRankCheckFrequency,
  type ProviderPlan,
  type ProviderRate,
} from "./estimate";
import { scheduledRunsPerMonth } from "./project-estimate";

export function optionResponse(option: FlatRateOption) {
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

export function planResponse(plan: ProviderPlan) {
  return {
    included_checks: plan.includedChecks,
    label: plan.label,
    monthly_price_cents: plan.monthlyPriceCents,
    monthly_price_usd: centsToDollars(plan.monthlyPriceCents),
    plan_key: plan.planKey,
  };
}

export function estimateForQuery(query: CostEstimateQuery, rate: ProviderRate): CostEstimateData {
  const runs = scheduledRunsPerMonth(query.frequency, query.cron_expression);
  const estimate = estimateCost(
    {
      depth: query.depth,
      deviceCount: query.devices,
      keywordCount: query.keywords,
      locationCount: query.locations,
      frequency: frequencyFromRankCheckFrequency(query.frequency),
    },
    rate,
    { optionKey: query.option, planKey: query.plan },
    runs ?? 0,
  );
  return {
    checks_per_run: estimate.checksPerRun,
    depth: query.depth,
    billing_units_per_check: estimate.billingUnitsPerCheck,
    result_pages_per_run: estimate.checksPerRun * estimate.billingUnitsPerCheck,
    runs_per_month: runs,
    effective_cost_per_check_cents: runs === null ? null : estimate.effectiveCostPerCheckCents,
    exceeds_largest_plan: estimate.exceedsLargestPlan,
    exceeds_selected_plan: estimate.exceedsSelectedPlan,
    monthly_checks: runs === null ? null : estimate.monthlyChecks,
    monthly_billing_units: runs === null ? null : estimate.monthlyBillingUnits,
    monthly_cost_cents: runs === null ? null : estimate.monthlyCostCents,
    monthly_cost_usd: runs === null ? null : centsToDollars(estimate.monthlyCostCents),
    provider_id: rate.providerId,
    pricing_model: rate.pricingModel,
    rate_checked_at: rate.checkedAt,
    rate_source_url: rate.sourceUrl,
    ...(estimate.selectedOption
      ? { selected_option: optionResponse(estimate.selectedOption) }
      : {}),
    ...(estimate.selectedPlan && runs !== null
      ? { selected_plan: planResponse(estimate.selectedPlan) }
      : {}),
  };
}
