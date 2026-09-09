import { centsToDollars } from "@/lib/format/currency";
import { flatPerCheckCostCents } from "./estimate";
import { DATAFORSEO_LIVE_RANK_CHECK_COST_CENTS, rateForProvider } from "./provider-rates";

const DATAFORSEO_MINIMUM_TOP_UP_CENTS = 5000;
const DATAFORSEO_TRIAL_CREDIT_CENTS = 100;

export const DATAFORSEO_LIVE_RANK_CHECK_COST = `$${centsToDollars(
  DATAFORSEO_LIVE_RANK_CHECK_COST_CENTS,
).toFixed(3)}`;

export const DATAFORSEO_TRIAL_CREDIT = `$${centsToDollars(DATAFORSEO_TRIAL_CREDIT_CENTS).toFixed(0)}`;
export const DATAFORSEO_MINIMUM_TOP_UP = `$${centsToDollars(DATAFORSEO_MINIMUM_TOP_UP_CENTS).toFixed(0)}`;

export function dataForSeoLiveRankCheckCostAtDepth(depth: 10 | 20 | 50 | 100) {
  const rate = rateForProvider("dataforseo");
  if (rate?.pricingModel !== "flat") {
    throw new Error("DataForSEO Live pricing is required for copy.");
  }
  const live = rate.options.find((option) => option.key === "live");
  if (!live) throw new Error("DataForSEO Live pricing is required for copy.");
  return `$${centsToDollars(flatPerCheckCostCents(live, depth)).toFixed(4)}`;
}

export function serpApiFreeMonthlySearches() {
  const rate = rateForProvider("serpapi");
  if (rate?.pricingModel !== "plan") {
    throw new Error("SerpApi plan pricing is required for copy.");
  }
  const freePlan = rate.plans.find((plan) => plan.planKey === "free");
  if (!freePlan) throw new Error("SerpApi free plan pricing is required for copy.");
  return freePlan.includedChecks;
}

export const OWN_PROVIDER_KEY_COST_EXPLANATION = `bisibility does not scrape Google. You connect a data provider (like DataForSEO) with your own API key - a check costs from about ${DATAFORSEO_LIVE_RANK_CHECK_COST}.`;
