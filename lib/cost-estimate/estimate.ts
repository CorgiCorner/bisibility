import type { SerpDepth } from "@/lib/serp/markets";

export type EstimateFrequency = "daily" | "weekly" | "monthly";

export const RUNS_PER_MONTH = {
  daily: 30,
  weekly: 4,
  monthly: 1,
} as const satisfies Record<EstimateFrequency, number>;

export type CheckVolumeInput = {
  depth: SerpDepth;
  keywordCount: number;
  locationCount: number;
  deviceCount: number;
  frequency: EstimateFrequency;
};

export type FlatRateOption = {
  additionalPageCostCents: number;
  key: string;
  label: string;
  shortLabel: string;
  turnaround: string;
  unitCostCents: number;
};

export type ProviderPlan = {
  planKey: string;
  label: string;
  monthlyPriceCents: number;
  includedChecks: number;
};

export type ProviderRate = {
  providerId: string;
  label: string;
  sourceUrl: string;
  checkedAt: string;
  notes?: string;
  // Ships with a self-hosted deployment. It carries a real (zero) rate so estimates resolve,
  // but it is not a service anyone can subscribe to, so it stays out of the public calculator.
  selfHosted?: boolean;
} & (
  | { pricingModel: "flat"; options: FlatRateOption[] }
  | { pricingModel: "plan"; plans: ProviderPlan[] }
);

export type EstimateSelection = {
  optionKey?: string;
  planKey?: string;
};

export type CostEstimate = {
  billingUnitsPerCheck: number;
  checksPerRun: number;
  monthlyBillingUnits: number;
  monthlyChecks: number;
  monthlyCostCents: number;
  effectiveCostPerCheckCents: number;
  selectedPlan: ProviderPlan | null;
  selectedOption: FlatRateOption | null;
  exceedsLargestPlan: boolean;
  exceedsSelectedPlan: boolean;
};

function clampCount(value: number, minimum: number) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, Math.floor(value));
}

function effectiveCost(monthlyCostCents: number, monthlyChecks: number) {
  return monthlyChecks > 0 ? monthlyCostCents / monthlyChecks : 0;
}

function buildEstimate(
  runChecks: number,
  checkCount: number,
  billingUnitsPerCheck: number,
  monthlyCostCents: number,
  selectedPlan: ProviderPlan | null,
  selectedOption: FlatRateOption | null,
  exceedsLargestPlan: boolean,
  exceedsSelectedPlan: boolean,
): CostEstimate {
  return {
    billingUnitsPerCheck,
    checksPerRun: runChecks,
    monthlyBillingUnits: checkCount * billingUnitsPerCheck,
    monthlyChecks: checkCount,
    monthlyCostCents,
    effectiveCostPerCheckCents: effectiveCost(monthlyCostCents, checkCount),
    selectedPlan,
    selectedOption,
    exceedsLargestPlan,
    exceedsSelectedPlan,
  };
}

export function pagesPerCheck(depth: SerpDepth): number {
  return Math.ceil(depth / 10);
}

export function flatPerCheckCostCents(option: FlatRateOption, depth: SerpDepth): number {
  const pages = pagesPerCheck(depth);

  return Number((option.unitCostCents + option.additionalPageCostCents * (pages - 1)).toFixed(6));
}

function cheapestPlan(plans: ProviderPlan[]) {
  // Callers validate non-empty plan collections before selecting a candidate.
  const firstPlan = plans[0] as ProviderPlan;
  const remainingPlans = plans.slice(1);

  return remainingPlans.reduce((cheapest, plan) => {
    if (plan.monthlyPriceCents < cheapest.monthlyPriceCents) {
      return plan;
    }

    if (
      plan.monthlyPriceCents === cheapest.monthlyPriceCents &&
      plan.includedChecks < cheapest.includedChecks
    ) {
      return plan;
    }

    return cheapest;
  }, firstPlan);
}

function largestPlan(plans: ProviderPlan[]) {
  // Callers validate non-empty plan collections before selecting a candidate.
  const firstPlan = plans[0] as ProviderPlan;
  const remainingPlans = plans.slice(1);

  return remainingPlans.reduce(
    (largest, plan) => (plan.includedChecks > largest.includedChecks ? plan : largest),
    firstPlan,
  );
}

export function checksPerRun(input: CheckVolumeInput): number {
  const keywordCount = clampCount(input.keywordCount, 0);
  const locationCount = clampCount(input.locationCount, 1);
  const deviceCount = clampCount(input.deviceCount, 1);

  return keywordCount * locationCount * deviceCount;
}

export function monthlyChecks(input: CheckVolumeInput): number {
  return checksPerRun(input) * RUNS_PER_MONTH[input.frequency];
}

export function selectPlan(
  plans: ProviderPlan[],
  /** Volume in provider billing units, such as successful searches. */
  volume: number,
): { plan: ProviderPlan; exceeds: boolean } {
  if (plans.length === 0) {
    throw new Error("Provider plans must not be empty");
  }

  const normalizedVolume = clampCount(volume, 0);
  const coveringPlans = plans.filter((plan) => plan.includedChecks >= normalizedVolume);

  if (coveringPlans.length > 0) {
    return { plan: cheapestPlan(coveringPlans), exceeds: false };
  }

  return { plan: largestPlan(plans), exceeds: true };
}

function selectPlanForChoice(
  plans: ProviderPlan[],
  volume: number,
  planKey?: string,
): { plan: ProviderPlan; exceedsLargest: boolean; exceedsSelected: boolean } {
  const normalizedVolume = clampCount(volume, 0);
  const pinnedPlan = planKey ? plans.find((plan) => plan.planKey === planKey) : undefined;

  if (pinnedPlan) {
    return {
      exceedsLargest: normalizedVolume > largestPlan(plans).includedChecks,
      exceedsSelected: pinnedPlan.includedChecks < normalizedVolume,
      plan: pinnedPlan,
    };
  }

  const selectedPlan = selectPlan(plans, normalizedVolume);

  return {
    exceedsLargest: selectedPlan.exceeds,
    exceedsSelected: selectedPlan.exceeds,
    plan: selectedPlan.plan,
  };
}

export function estimateCost(
  volume: CheckVolumeInput,
  rate: ProviderRate,
  selection: EstimateSelection = {},
): CostEstimate {
  const runChecks = checksPerRun(volume);
  const checkCount = runChecks * RUNS_PER_MONTH[volume.frequency];
  const billingUnitsPerCheck = pagesPerCheck(volume.depth);

  if (rate.pricingModel === "flat") {
    const selectedOption =
      rate.options.find((option) => option.key === selection.optionKey) ?? rate.options[0] ?? null;

    if (!selectedOption) {
      throw new Error("Flat provider rates must include at least one option");
    }

    const monthlyCostCents = checkCount * flatPerCheckCostCents(selectedOption, volume.depth);

    return buildEstimate(
      runChecks,
      checkCount,
      billingUnitsPerCheck,
      monthlyCostCents,
      null,
      selectedOption,
      false,
      false,
    );
  }

  const monthlyBillingUnits = checkCount * billingUnitsPerCheck;
  const selectedPlan = selectPlanForChoice(rate.plans, monthlyBillingUnits, selection.planKey);
  const monthlyCostCents = selectedPlan.plan.monthlyPriceCents;

  return buildEstimate(
    runChecks,
    checkCount,
    billingUnitsPerCheck,
    monthlyCostCents,
    selectedPlan.plan,
    null,
    selectedPlan.exceedsLargest,
    selectedPlan.exceedsSelected,
  );
}

export function estimateCostAtUnitRate(
  volume: CheckVolumeInput,
  unitCostCents: number,
): CostEstimate {
  const runChecks = checksPerRun(volume);
  const checkCount = runChecks * RUNS_PER_MONTH[volume.frequency];
  const monthlyCostCents = checkCount * unitCostCents;

  return buildEstimate(runChecks, checkCount, 1, monthlyCostCents, null, null, false, false);
}

export function frequencyFromRankCheckFrequency(
  frequency: "paused" | "manual" | "daily" | "weekly" | "monthly" | "custom_cron",
): EstimateFrequency {
  if (frequency === "daily") {
    return "daily";
  }

  if (frequency === "weekly") {
    return "weekly";
  }

  if (frequency === "monthly") {
    return "monthly";
  }

  return "monthly";
}
