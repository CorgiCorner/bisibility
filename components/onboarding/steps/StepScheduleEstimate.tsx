import {
  formatEstimateCents,
  monthlyChecksFor,
  monthlyCostCentsFor,
} from "@/lib/cost-estimate/project-estimate";
import type { SerpDepth } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { OnboardingCostSummary } from "./OnboardingCostSummary";

const BASKET_KEYWORDS = 20;

type StepScheduleEstimateProps = {
  depth: SerpDepth;
  deviceCount: number;
  frequency: RankCheckFrequency;
  locationCount: number;
  overrideCents?: number | null;
  providerId?: string | null;
};

export function StepScheduleEstimate({
  depth,
  deviceCount,
  frequency,
  locationCount,
  overrideCents,
  providerId,
}: Readonly<StepScheduleEstimateProps>) {
  const rate = { overrideCents: overrideCents ?? null, providerId: providerId ?? null };
  const volume = { depth, deviceCount, frequency, keywordCount: 1, locationCount };
  const keywordCost = monthlyCostCentsFor(volume, rate);
  const keywordChecks = monthlyChecksFor(volume);
  const basketCost = keywordCost == null ? null : keywordCost * BASKET_KEYWORDS;
  const basketChecks = keywordChecks == null ? null : keywordChecks * BASKET_KEYWORDS;

  return (
    <OnboardingCostSummary>
      <p className="m-0 text-fg">
        {keywordChecks == null || basketChecks == null
          ? "This estimate excludes the custom cron schedule until the expression is valid."
          : keywordCost == null || basketCost == null
            ? `Each keyword at this setup creates ~${keywordChecks.toLocaleString()} checks/mo - e.g. ${BASKET_KEYWORDS} keywords create ~${basketChecks.toLocaleString()} checks/mo.`
            : `Each keyword at this setup ~ ${formatEstimateCents(keywordCost)}/mo - e.g. ${BASKET_KEYWORDS} keywords ~ ${formatEstimateCents(basketCost)}/mo.`}
      </p>
    </OnboardingCostSummary>
  );
}
