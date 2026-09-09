import type { TrackingScheduleSelection } from "@/components/keywords/add/TrackingConfigurationFields";
import {
  formatEstimateCents,
  monthlyTrackingCostCents,
  unitCostCentsFor,
} from "@/lib/cost-estimate/project-estimate";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";

export type TrackMarketOption = {
  disabled: boolean;
  key: string;
  language: string;
  name: string;
};

function selectedFrequency(
  costContext: ProjectCostContext,
  selection: TrackingScheduleSelection,
): RankCheckFrequency {
  return selection === "project_default" ? costContext.rawFrequency : selection;
}

function scheduleLine(frequency: RankCheckFrequency) {
  if (frequency === "daily") return "1 check per day";
  if (frequency === "weekly") return "1 check per week";
  if (frequency === "monthly") return "1 check per month";
  if (frequency === "custom_cron") return "Checks on your custom project schedule";
  return "No scheduled checks";
}

export function trackConfirmLabel(
  selection: TrackingScheduleSelection,
  projectFrequency: RankCheckFrequency,
) {
  if (selection === "project_default") {
    const label = projectFrequency === "custom_cron" ? "custom schedule" : projectFrequency;
    return `Use project default: ${label.replace("_", " ")}`;
  }
  if (selection === "manual") return "Add as manual";
  if (selection === "paused") return "Add paused";
  return `Start tracking ${selection.replace("_", " ")}`;
}

/** Prices the exact schedule and depth the dialog will submit. */
export function trackCostLine(
  costContext: ProjectCostContext,
  selection: TrackingScheduleSelection,
  depth: SerpDepth,
) {
  const frequency = selectedFrequency(costContext, selection);
  const schedule = scheduleLine(frequency);
  if (frequency === "paused") return schedule;
  const rate = { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId };
  const unitCents = unitCostCentsFor(rate, depth);
  if (frequency === "manual") {
    return unitCents == null
      ? schedule
      : `${schedule} / ${formatEstimateCents(unitCents)} per manual check`;
  }
  const monthCents = monthlyTrackingCostCents(1, { ...costContext, ...rate, depth }, frequency);
  if (unitCents == null || monthCents == null) return schedule;
  return [
    schedule,
    `${formatEstimateCents(unitCents)} per check`,
    `${formatEstimateCents(monthCents)} per month`,
  ].join(" / ");
}

/** A paused market is shown and refused: it explains the gap instead of hiding it. */
export function trackMarketOptions(markets: ProjectMarketsView): TrackMarketOption[] {
  return markets.markets.map((market) => ({
    disabled: market.status !== "active",
    key: market.canonicalKey,
    language: market.languageLabel,
    name: market.displayName,
  }));
}

/** The project's own default when it is still trackable, otherwise the first market that is. */
export function trackDefaultMarketKey(
  options: readonly TrackMarketOption[],
  preferred: string | null,
) {
  const wanted = options.find((option) => option.key === preferred && !option.disabled);
  return (wanted ?? options.find((option) => !option.disabled))?.key ?? null;
}
