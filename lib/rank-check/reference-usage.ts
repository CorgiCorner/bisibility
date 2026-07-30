import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { rateForProvider } from "@/lib/cost-estimate/provider-rates";
import { DEFAULT_SERP_DEPTH, resolveSerpDepth, type SerpDepth } from "@/lib/serp/markets";
import { defaultCostPerBillingUnitCents, defaultCostPerCheckCents } from "./default-cost";

export type ReferenceUsageGroup = {
  billingUnits: number | null;
  checks: number;
  provider: string;
  requestedDepth: number | null;
};

export type ProviderReferenceUsage = {
  billableUnits: number;
  checks: number;
  provider: string;
  providerLabel: string;
  rateBasis: string;
  referenceCostCents: number;
  referenceCostKnown: boolean;
};

function count(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function depth(value: number | null): SerpDepth {
  try {
    return resolveSerpDepth(value ?? undefined);
  } catch {
    return DEFAULT_SERP_DEPTH;
  }
}

function labelForProvider(provider: string) {
  const rate = rateForProvider(provider);
  if (rate) return rate.label;
  return provider
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function rateBasis(provider: string) {
  const rate = rateForProvider(provider);
  if (!rate) return "Rate unavailable";
  return rate.pricingModel === "flat" ? "Live depth pricing" : "Production plan equivalent";
}

function usageForGroup(group: ReferenceUsageGroup): ProviderReferenceUsage {
  const checks = count(group.checks);
  const requestedDepth = depth(group.requestedDepth);
  const rate = rateForProvider(group.provider);
  const unitsPerCheck =
    count(group.billingUnits) ||
    (rate?.pricingModel === "plan" ? pagesPerCheck(requestedDepth) : 1);
  const billableUnits = checks * unitsPerCheck;
  const referenceCostCents =
    rate?.pricingModel === "plan"
      ? billableUnits * defaultCostPerBillingUnitCents(group.provider)
      : checks * defaultCostPerCheckCents(group.provider, requestedDepth);

  return {
    billableUnits,
    checks,
    provider: group.provider,
    providerLabel: labelForProvider(group.provider),
    rateBasis: rateBasis(group.provider),
    referenceCostCents: Number(referenceCostCents.toFixed(6)),
    referenceCostKnown: Boolean(rate),
  };
}

export function aggregateProviderReferenceUsage(
  groups: readonly ReferenceUsageGroup[],
): ProviderReferenceUsage[] {
  const usage = new Map<string, ProviderReferenceUsage>();

  for (const group of groups) {
    const next = usageForGroup(group);
    const current = usage.get(group.provider);
    if (!current) {
      usage.set(group.provider, next);
      continue;
    }
    current.billableUnits += next.billableUnits;
    current.checks += next.checks;
    current.referenceCostCents = Number(
      (current.referenceCostCents + next.referenceCostCents).toFixed(6),
    );
  }

  return [...usage.values()].sort(
    (left, right) =>
      right.referenceCostCents - left.referenceCostCents ||
      left.providerLabel.localeCompare(right.providerLabel),
  );
}
