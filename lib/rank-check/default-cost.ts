import { flatPerCheckCostCents, pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { rateForProvider } from "@/lib/cost-estimate/provider-rates";
import { type ResolveProviderRateInput, resolveProviderRate } from "@/lib/provider-rates/resolver";
import type { SerpDepth } from "@/lib/serp/markets";

const DEFAULT_FLAT_OPTION_KEY = "live";
const DEFAULT_PLAN_KEY = "production";

export function defaultCostPerBillingUnitCents(providerId: string | undefined): number {
  if (!providerId) return 0;
  const rate = rateForProvider(providerId);
  if (rate?.pricingModel !== "plan") return 0;
  const plan = rate.plans.find((item) => item.planKey === DEFAULT_PLAN_KEY);
  if (!plan || plan.includedChecks <= 0) return 0;
  return plan.monthlyPriceCents / plan.includedChecks;
}

export function defaultCostPerCheckCents(providerId: string | undefined, depth: SerpDepth): number {
  if (!providerId) return 0;
  const rate = rateForProvider(providerId);
  if (!rate) return 0;
  if (rate.pricingModel === "plan") {
    return Number((defaultCostPerBillingUnitCents(providerId) * pagesPerCheck(depth)).toFixed(6));
  }
  const option = rate.options.find((item) => item.key === DEFAULT_FLAT_OPTION_KEY);
  return option ? flatPerCheckCostCents(option, depth) : 0;
}

export function estimatedRankCheckCostCents(
  providerId: string | undefined,
  depth: SerpDepth,
  configuredCostCents: unknown,
  context: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">,
): number | null {
  let manualAmountCents: unknown = context.manualAmountCents;
  if (configuredCostCents != null) {
    const configured = Number(configuredCostCents);
    if (!Number.isFinite(configured) || configured < 0) return null;
    manualAmountCents = configured;
  }
  const listRate = providerId ? rateForProvider(providerId) : null;
  const resolved = resolveProviderRate({
    entries: context.entries,
    list: listRate
      ? {
          amountCents: defaultCostPerCheckCents(providerId, depth),
          checkedAt: new Date(`${listRate.checkedAt}T00:00:00.000Z`),
        }
      : null,
    manualAmountCents,
  });

  return "amountCents" in resolved ? resolved.amountCents : null;
}
