import { monthlyTrackingCostCents } from "@/lib/cost-estimate/project-estimate";
import { withRankCheckManualRate } from "@/lib/provider-rates/manual-rate";
import {
  type ProviderChainEntry,
  primaryProviderConnection,
} from "@/lib/rank-check/provider-chain-order";
import { resolveEffectiveSerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";

type MarketCostSchedule = {
  cronExpression: string | null;
  frequency: RankCheckFrequency;
  serpDepth: number | null;
};

type MarketCostInput = {
  defaults: MarketCostSchedule | null;
  providerConnections: (ProviderChainEntry & Parameters<typeof withRankCheckManualRate>[0])[];
};

export type MarketCostKeyword = { schedule: MarketCostSchedule | null };

export function marketMonthlyCostCents(
  keywords: readonly MarketCostKeyword[],
  project: MarketCostInput,
) {
  const selected = primaryProviderConnection(project.providerConnections, "serp");
  const primary = selected ? withRankCheckManualRate(selected) : null;
  let total = 0;
  for (const keyword of keywords) {
    const schedule = keyword.schedule ?? project.defaults;
    const estimate = monthlyTrackingCostCents(1, {
      cronExpression: schedule?.cronExpression ?? null,
      depth: resolveEffectiveSerpDepth({
        projectDepth: project.defaults?.serpDepth,
        scheduleDepth: keyword.schedule?.serpDepth,
      }),
      overrideCents: primary?.costPerCheckCents == null ? null : Number(primary.costPerCheckCents),
      providerId: primary?.provider ?? null,
      rawFrequency: schedule?.frequency ?? "manual",
    });
    if (estimate == null) return null;
    total += Number(estimate);
  }
  return total;
}
