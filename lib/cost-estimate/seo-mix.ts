import {
  type CostEstimate,
  estimateCost,
  flatPerCheckCostCents,
  type ProviderRate,
} from "./estimate";
import {
  type SeoMixComponent,
  type SeoMixInputs,
  type SeoMixOperation,
  type SeoMixPolicy,
  type SeoMixSnapshot,
  seoMixSchema,
} from "./seo-mix-contract";
import { decimalTicks, fixedCents, hostedPriceUnits, roundedUnits } from "./seo-mix-money";

export type SeoMixOperationEstimate = {
  status: "available" | "unavailable";
  providerCostCents: string | null;
  usageCostCents: string | null;
  components: (SeoMixComponent & { monthlyProviderCents: string; monthlyUsageCents: string })[];
};
const unavailable = (): SeoMixOperationEstimate => ({
  status: "unavailable",
  providerCostCents: null,
  usageCostCents: null,
  components: [],
});
function hasProvenance(rate: { checkedAt: string; sourceUrl: string }) {
  try {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(rate.checkedAt) &&
      new Date(rate.checkedAt).toISOString().slice(0, 10) === rate.checkedAt &&
      new URL(rate.sourceUrl).protocol === "https:"
    );
  } catch {
    return false;
  }
}
function validateRate(rate: ProviderRate) {
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  if (!hasProvenance(rate)) throw new Error("Missing rate provenance");
  if (rate.pricingModel === "flat") {
    if (
      !rate.options.length ||
      rate.options.some(
        (option) =>
          !positive(option.unitCostCents) ||
          !Number.isFinite(option.additionalPageCostCents) ||
          option.additionalPageCostCents < 0,
      )
    )
      throw new Error("Invalid rate");
  } else if (
    !rate.plans.length ||
    rate.plans.some(
      (plan) =>
        !Number.isSafeInteger(plan.includedChecks) ||
        plan.includedChecks < 1 ||
        !Number.isSafeInteger(plan.monthlyPriceCents) ||
        plan.monthlyPriceCents < 0,
    )
  )
    throw new Error("Invalid plans");
}
function operationPriceUnits(component: SeoMixComponent, policy: SeoMixPolicy | undefined) {
  if (!policy || component.providerCostCents === null)
    throw new Error("Missing pricing policy or rate");
  return hostedPriceUnits(component.providerCostCents, component.quantity, policy);
}
function aggregateComponents(
  components: SeoMixComponent[],
  count: number,
  mode: SeoMixInputs["fundingMode"],
  policy: SeoMixPolicy | undefined,
): SeoMixOperationEstimate {
  if (count === 0)
    return {
      status: "available",
      providerCostCents: "0.0000",
      usageCostCents: "0.0000",
      components: [],
    };
  try {
    if (mode === "credits" && !policy) throw new Error("Missing pricing policy");
    if (!components.length) throw new Error("Missing operation rates");
    let providerTicks = 0n;
    let usageUnits = 0n;
    const details = components.map((component) => {
      if (
        !component.providerCostCents ||
        !hasProvenance(component) ||
        !Number.isSafeInteger(component.quantity) ||
        component.quantity < 1
      )
        throw new Error("Invalid operation rate");
      const cost = decimalTicks(component.providerCostCents);
      if (cost <= 0n) throw new Error("Missing positive rate");
      const monthlyTicks = cost * BigInt(count);
      const price =
        mode === "credits"
          ? operationPriceUnits(component, policy) * BigInt(count)
          : roundedUnits(monthlyTicks);
      providerTicks += monthlyTicks;
      usageUnits += price;
      return {
        ...component,
        monthlyProviderCents: fixedCents(roundedUnits(monthlyTicks)),
        monthlyUsageCents: fixedCents(price),
      };
    });
    return {
      status: "available",
      providerCostCents: fixedCents(roundedUnits(providerTicks)),
      usageCostCents: fixedCents(mode === "byok" ? roundedUnits(providerTicks) : usageUnits),
      components: details,
    };
  } catch {
    return unavailable();
  }
}
function rankEstimate(inputs: SeoMixInputs, snapshot: SeoMixSnapshot) {
  const rate = snapshot.rankRates.find((candidate) => candidate.providerId === inputs.providerId);
  if (!rate) throw new Error("Missing rank rate");
  validateRate(rate);
  if (
    rate.pricingModel === "flat" &&
    !rate.options.some((option) => option.key === inputs.optionKey)
  )
    throw new Error("Unsupported queue");
  if (
    rate.pricingModel === "plan" &&
    inputs.planKey !== "auto" &&
    !rate.plans.some((plan) => plan.planKey === inputs.planKey)
  )
    throw new Error("Unsupported plan");
  const rank = estimateCost(
    {
      depth: inputs.depth,
      keywordCount: inputs.keywordCount,
      deviceCount: inputs.devices === "both" ? 2 : 1,
      locationCount: inputs.locationCount,
      frequency: inputs.frequency,
    },
    rate,
    {
      optionKey: inputs.optionKey,
      planKey: inputs.planKey === "auto" ? undefined : inputs.planKey,
    },
  );
  if (rank.exceedsLargestPlan || rank.exceedsSelectedPlan)
    return { rank, operation: unavailable() };
  if (rate.pricingModel === "plan") {
    const cost = fixedCents(roundedUnits(decimalTicks(String(rank.monthlyCostCents))));
    return {
      rank,
      operation:
        inputs.fundingMode === "credits"
          ? unavailable()
          : {
              status: "available" as const,
              providerCostCents: cost,
              usageCostCents: cost,
              components: [],
            },
    };
  }
  if (!rank.selectedOption) throw new Error("Missing queue rate");
  const cost = flatPerCheckCostCents(rank.selectedOption, inputs.depth);
  const operation = aggregateComponents(
    [
      {
        key: inputs.optionKey,
        providerId: rate.providerId,
        providerCostCents: String(cost),
        quantity: 1,
        checkedAt: rate.checkedAt,
        sourceUrl: rate.sourceUrl,
      },
    ],
    rank.monthlyChecks,
    inputs.fundingMode,
    snapshot.policies?.rank,
  );
  return { rank, operation };
}
export function estimateSeoMix(
  rawInputs: unknown,
  snapshot: SeoMixSnapshot,
  interval: "month" | "year" = "month",
) {
  const parsed = seoMixSchema.safeParse(rawInputs);
  const operations: Record<SeoMixOperation, SeoMixOperationEstimate> = {
    rank: unavailable(),
    research: unavailable(),
    domains: unavailable(),
    backlinks: unavailable(),
  };
  let rank: CostEstimate | null = null;
  let accessCents: string | null = null;
  let totalMonthlyCents: string | null = null;
  let usageMonthlyCents: string | null = null;
  if (parsed.success) {
    const inputs = parsed.data;
    try {
      const result = rankEstimate(inputs, snapshot);
      rank = result.rank;
      operations.rank = result.operation;
    } catch {
      /* Missing rank facts leave the other operation estimates usable. */
    }
    for (const [key, count] of [
      ["research", inputs.researchCount],
      ["domains", inputs.domainCount],
      ["backlinks", inputs.backlinkCount],
    ] as const)
      operations[key] = aggregateComponents(
        snapshot.operations[key],
        count,
        inputs.fundingMode,
        snapshot.policies?.[key],
      );
    try {
      const access = snapshot.access;
      if (
        access.state === "unavailable" ||
        !["not_started", "pending", "enforced"].includes(access.state)
      )
        throw new Error("Missing access policy");
      const monthly = decimalTicks(access.monthlyCents[inputs.fundingMode]);
      const annual = decimalTicks(access.annualCents[inputs.fundingMode]);
      const accessUnits =
        access.state !== "enforced"
          ? 0n
          : interval === "year"
            ? (annual + 60_000n) / 120_000n
            : roundedUnits(monthly);
      accessCents = fixedCents(accessUnits);
      if (Object.values(operations).every((operation) => operation.status === "available")) {
        const usage = Object.values(operations).reduce((sum, operation) => {
          if (operation.usageCostCents === null) throw new Error("Missing operation cost");
          return sum + roundedUnits(decimalTicks(operation.usageCostCents));
        }, 0n);
        usageMonthlyCents = fixedCents(usage);
        totalMonthlyCents = fixedCents(usage + accessUnits);
      }
    } catch {
      /* Never substitute a free subscription for missing access policy. */
    }
  }
  return {
    status: totalMonthlyCents === null ? ("unavailable" as const) : ("available" as const),
    operations,
    rank,
    accessCents,
    usageMonthlyCents,
    totalMonthlyCents,
  };
}
export type SeoMixEstimate = ReturnType<typeof estimateSeoMix>;
