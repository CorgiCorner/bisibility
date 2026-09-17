import type { TrackingScheduleSelection } from "@/components/keywords/add/TrackingConfigurationFields";
import { monthlyTrackingCostCents, unitCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { useTranslations } from "next-intl";

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

type TrackDialogTranslations = ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;

type TrackDialogPresentation = {
  formatMoney: (cents: number) => string;
  t: TrackDialogTranslations;
};

function scheduleLine(frequency: RankCheckFrequency, t: TrackDialogTranslations) {
  if (frequency === "daily") return t("trackCostDaily");
  if (frequency === "weekly") return t("trackCostWeekly");
  if (frequency === "monthly") return t("trackCostMonthly");
  if (frequency === "custom_cron") return t("trackCostCustom");
  return t("trackCostNone");
}

export function trackConfirmLabel(
  selection: TrackingScheduleSelection,
  projectFrequency: RankCheckFrequency,
  t: TrackDialogTranslations,
) {
  if (selection === "project_default") {
    const frequency =
      projectFrequency === "custom_cron"
        ? t("trackScheduleProjectDefaultCustom_cron")
        : projectFrequency === "daily"
          ? t("trackScheduleProjectDefaultDaily")
          : projectFrequency === "weekly"
            ? t("trackScheduleProjectDefaultWeekly")
            : projectFrequency === "monthly"
              ? t("trackScheduleProjectDefaultMonthly")
              : projectFrequency === "manual"
                ? t("trackScheduleProjectDefaultManual")
                : t("trackScheduleProjectDefaultPaused");
    return t("trackConfirmProjectDefault", { frequency });
  }
  if (selection === "manual") return t("trackConfirmManual");
  if (selection === "paused") return t("trackConfirmPaused");
  if (selection === "daily") return t("trackConfirmDaily");
  if (selection === "weekly") return t("trackConfirmWeekly");
  return t("trackConfirmMonthly");
}

/** Prices the exact schedule and depth the dialog will submit. */
export function trackCostLine(
  costContext: ProjectCostContext,
  selection: TrackingScheduleSelection,
  depth: SerpDepth,
  presentation: TrackDialogPresentation,
) {
  const { formatMoney, t } = presentation;
  const frequency = selectedFrequency(costContext, selection);
  const schedule = scheduleLine(frequency, t);
  if (frequency === "paused") return schedule;
  const rate = { overrideCents: costContext.costPerCheckCents, providerId: costContext.providerId };
  const unitCents = unitCostCentsFor(rate, depth);
  if (frequency === "manual") {
    return unitCents == null
      ? schedule
      : t("trackCostManual", { price: formatMoney(unitCents), schedule });
  }
  const monthCents = monthlyTrackingCostCents(1, { ...costContext, ...rate, depth }, frequency);
  if (unitCents == null || monthCents == null) return schedule;
  return t("trackCostRecurring", {
    month: formatMoney(monthCents),
    schedule,
    unit: formatMoney(unitCents),
  });
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
