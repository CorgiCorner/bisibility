import {
  type CheckVolumeInput,
  checksPerRun,
  estimateCostAtUnitRate,
} from "@/lib/cost-estimate/estimate";
import {
  LIST_PROVIDER_RATE_CONTEXT,
  type ResolveProviderRateInput,
} from "@/lib/provider-rates/resolver";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import type { SerpDepth } from "@/lib/serp/markets";
import { parseCronExpression, type RankCheckFrequency, runsPerMonth } from "@/lib/settings/options";

export type CostRateInfo = {
  providerId: string | null;
  overrideCents: number | null;
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
};

export type ProjectEstimateVolume = Omit<CheckVolumeInput, "frequency"> & {
  cronExpression?: string | null;
  frequency: RankCheckFrequency;
};

export function unitCostCentsFor(rate: CostRateInfo, depth: SerpDepth): number | null {
  return estimatedRankCheckCostCents(
    rate.providerId ?? undefined,
    depth,
    rate.overrideCents,
    rate.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
  );
}

export function scheduledRunsPerMonth(
  frequency: RankCheckFrequency,
  cronExpression?: string | null,
): number | null {
  if (frequency === "manual" || frequency === "paused") {
    return 0;
  }
  if (frequency === "custom_cron") {
    if (!cronExpression) return null;
    const parsed = parseCronExpression(cronExpression);
    return parsed.ok ? runsPerMonth(parsed, frequency) : null;
  }
  const cron =
    frequency === "daily" ? "0 6 * * *" : frequency === "weekly" ? "0 6 * * 1" : "0 6 1 * *";
  return runsPerMonth(parseCronExpression(cron), frequency);
}

export function monthlyCostCentsFor(
  volume: ProjectEstimateVolume,
  rate: CostRateInfo,
): number | null {
  const unitCostCents = unitCostCentsFor(rate, volume.depth);
  if (unitCostCents == null) {
    return null;
  }
  const perRun = estimateCostAtUnitRate({ ...volume, frequency: "monthly" }, unitCostCents);
  const scheduledRuns = scheduledRunsPerMonth(volume.frequency, volume.cronExpression);
  return scheduledRuns == null ? null : perRun.monthlyCostCents * scheduledRuns;
}

type TrackingCostContext = CostRateInfo & {
  cronExpression: string | null;
  depth: SerpDepth;
  rawFrequency: RankCheckFrequency;
};

export function monthlyTrackingCostCents(
  count: number,
  context: TrackingCostContext,
  frequency: RankCheckFrequency = context.rawFrequency,
) {
  return monthlyCostCentsFor(
    {
      cronExpression: context.cronExpression,
      depth: context.depth,
      deviceCount: 1,
      frequency,
      keywordCount: count,
      locationCount: 1,
    },
    { overrideCents: context.overrideCents, providerId: context.providerId },
  );
}

export function frequencyDeltaCents(
  volume: Omit<ProjectEstimateVolume, "frequency">,
  from: RankCheckFrequency,
  to: RankCheckFrequency,
  rate: CostRateInfo,
): number | null {
  const fromCost = monthlyCostCentsFor({ ...volume, frequency: from }, rate);
  const toCost = monthlyCostCentsFor({ ...volume, frequency: to }, rate);
  return fromCost == null || toCost == null ? null : toCost - fromCost;
}

export function runCostCents(depths: SerpDepth[], rate: CostRateInfo): number | null {
  if (depths.length === 0) {
    return 0;
  }
  let total = 0;
  for (const depth of depths) {
    const cost = unitCostCentsFor(rate, depth);
    if (cost == null) return null;
    total += cost;
  }
  return total;
}

export function monthlyChecksFor(volume: ProjectEstimateVolume): number | null {
  const scheduledRuns = scheduledRunsPerMonth(volume.frequency, volume.cronExpression);
  return scheduledRuns == null
    ? null
    : checksPerRun({ ...volume, frequency: "monthly" }) * scheduledRuns;
}

export function formatEstimateCents(cents: number): string {
  const absoluteCents = Math.abs(cents);
  const sign = cents < 0 ? "-" : "";
  if (absoluteCents > 0 && absoluteCents < 1) {
    return `${sign}< $0.01`;
  }
  return `${sign}$${(absoluteCents / 100).toFixed(2)}`;
}
