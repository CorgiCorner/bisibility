import { monthlyChecksFor, monthlyCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import type { SerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { SuggestionDrawerMessages } from "./keyword-suggestion-copy";

export type SuggestionCostContext = {
  cronExpression?: string | null;
  depth: SerpDepth;
  deviceCount: number;
  frequency: RankCheckFrequency;
  locationCount: number;
  overrideCents: number | null;
  providerId: string | null;
};

/** Converts the shared estimation model into a feature-owned presentation contract. */
export function suggestionCostLine(
  count: number,
  context: SuggestionCostContext,
  messages: SuggestionDrawerMessages,
) {
  const volume = {
    cronExpression: context.cronExpression,
    depth: context.depth,
    deviceCount: context.deviceCount,
    frequency: context.frequency,
    keywordCount: count,
    locationCount: context.locationCount,
  };
  const checks = monthlyChecksFor(volume);
  if (checks == null) return messages.selectionCount({ count });

  const costCents = monthlyCostCentsFor(volume, {
    overrideCents: context.overrideCents,
    providerId: context.providerId,
  });
  if (costCents == null) return messages.monthlyChecks({ checks, count });
  if (costCents > 0 && costCents < 1) {
    return messages.monthlyChecksCostBelowCent({ checks, count, minimum: 0.01 });
  }

  return messages.monthlyChecksCost({ checks, cost: costCents / 100, count });
}
