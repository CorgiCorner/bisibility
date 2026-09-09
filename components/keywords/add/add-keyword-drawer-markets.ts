import type { ScheduleAssignmentSchedule } from "@/components/markets/blocks/ScheduleAssignment";
import type { NewMarketCreateResult } from "@/lib/markets/create-input";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { supportsResearchScope } from "@/lib/serp/research-capability";

type DrawerMarket = ProjectMarketsView["markets"][number];

/**
 * The market list entry for a market the drawer just created. Everything comes from the creation
 * result except `researchAvailable`, which is a pure lookup over the bundled SERP catalog, and the
 * cost, which no run has produced yet.
 */
export function createdDrawerMarket(result: NewMarketCreateResult): DrawerMarket {
  return {
    canonicalKey: result.canonicalKey,
    countryCode: result.countryCode,
    displayName: result.displayName,
    id: result.publicId,
    keywordCount: result.keywordCount,
    languageCode: result.languageCode,
    languageLabel: result.languageLabel,
    monthlyCostCents: null,
    researchAvailable: supportsResearchScope(result.countryCode, result.languageCode),
    status: "active",
  };
}

const assignableFrequencies = new Set(["custom_cron", "daily", "monthly", "weekly"]);

/** Current automatic schedules; manual checks do not need a stored schedule. */
export function assignableSchedules(
  schedules: readonly { frequency: string; id: string; name: string }[] | undefined,
  costPerCheckCents: number | null | undefined,
): ScheduleAssignmentSchedule[] {
  return (schedules ?? [])
    .filter((schedule) => assignableFrequencies.has(schedule.frequency))
    .map((schedule) => ({
      costPerCheckCents: costPerCheckCents ?? null,
      frequency: schedule.frequency as ScheduleAssignmentSchedule["frequency"],
      id: schedule.id,
      name: schedule.name,
    }));
}

export function drawerMarketRegistry(
  projectId: string,
  markets?: ProjectMarketsView,
): ProjectMarketsView {
  return (
    markets ?? { markets: [], maxMarkets: 5, monthlyCostCents: null, perMarketChecks: 0, projectId }
  );
}

/** Project scope starts with active markets; an explicit market can be prepared while paused. */
export function selectedDrawerMarketKeys(
  markets: readonly DrawerMarket[],
  initialMarketKeys?: readonly string[],
): string[] {
  return markets
    .filter((market) =>
      initialMarketKeys === undefined
        ? market.status === "active"
        : initialMarketKeys.includes(market.canonicalKey),
    )
    .map((market) => market.canonicalKey);
}
