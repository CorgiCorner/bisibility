import { rateForProvider } from "@/lib/cost-estimate/provider-rates";

const baseSerpApiCostCaption = "Plan-based - monthly search quota";

export function serpApiCostCaption() {
  const rate = rateForProvider("serpapi");
  const freePlan =
    rate?.pricingModel === "plan" ? rate.plans.find((plan) => plan.planKey === "free") : undefined;

  return freePlan
    ? `${baseSerpApiCostCaption}, ${freePlan.includedChecks} searches/mo free`
    : baseSerpApiCostCaption;
}
