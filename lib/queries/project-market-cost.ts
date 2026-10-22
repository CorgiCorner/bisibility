import { monthlyTrackingCostCents } from "@/lib/cost-estimate/project-estimate";
import { withRankCheckManualRate } from "@/lib/provider-rates/manual-rate";
import {
  type ProviderChainEntry,
  primaryProviderConnection,
} from "@/lib/rank-check/provider-chain-order";
import { scheduleProviderId } from "@/lib/rank-check/schedules/provider-policy";
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

export type MarketCostKeyword = {
  archivedAt?: Date | null;
  checkSchedule?:
    | (MarketCostSchedule & {
        enabled: boolean;
        archivedAt: Date | null;
        providerPolicy?: string | null;
      })
    | null;
  schedule: MarketCostSchedule | null;
};

export function marketMonthlyCostCents(
  keywords: readonly MarketCostKeyword[],
  project: MarketCostInput,
) {
  let total = 0;
  for (const keyword of keywords) {
    if (keyword.archivedAt) continue;
    const schedule =
      keyword.checkSchedule?.enabled && !keyword.checkSchedule.archivedAt
        ? keyword.checkSchedule
        : null;
    if (!schedule || schedule.frequency === "manual" || schedule.frequency === "paused") continue;
    const pinnedProvider = scheduleProviderId(schedule.providerPolicy);
    const selected = primaryProviderConnection(
      pinnedProvider
        ? project.providerConnections.filter((row) => row.provider === pinnedProvider)
        : project.providerConnections,
      "serp",
    );
    if (!selected) return null;
    const primary = withRankCheckManualRate(selected);
    const estimate = monthlyTrackingCostCents(1, {
      cronExpression: schedule?.cronExpression ?? null,
      depth: resolveEffectiveSerpDepth({
        projectDepth: project.defaults?.serpDepth,
        checkScheduleDepth: schedule?.serpDepth,
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
