"use client";

import { EstimateStatus } from "@/components/cost-estimate/EstimateStatus";
import { useCostEstimate } from "@/components/cost-estimate/useCostEstimate";
import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { buildCostCalculatorHref } from "@/lib/cost-estimate/calculator-query";
import { DEFAULT_ONBOARDING_FREQUENCY } from "@/lib/onboarding/defaults";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth, type SerpDevice } from "@/lib/serp/constants";
import { MARKETING_URL } from "@/lib/site/site";
import { OnboardingCostSummary } from "./OnboardingCostSummary";

type KeywordImportSummaryProps = {
  cronExpression?: string | null;
  devices: readonly SerpDevice[];
  frequency?: KeywordScheduleInput["frequency"];
  keywordCount: number;
  locationCount: number;
  serpDepth?: SerpDepth;
};

export function KeywordImportSummary({
  cronExpression,
  devices,
  frequency = DEFAULT_ONBOARDING_FREQUENCY,
  keywordCount,
  locationCount,
  serpDepth = DEFAULT_SERP_DEPTH,
}: Readonly<KeywordImportSummaryProps>) {
  const deploymentMode = useDeploymentMode();
  const state = useCostEstimate({
    keywordCount,
    locationCount,
    deviceCount: devices.length,
    depth: serpDepth,
    frequency,
    cronExpression,
  });
  if (keywordCount <= 0 || locationCount <= 0 || devices.length === 0) return null;
  if (!state.data)
    return (
      <OnboardingCostSummary>
        <EstimateStatus state={state} />
      </OnboardingCostSummary>
    );
  const pages = state.data.result_pages_per_run;
  const monthlyPages = state.data.monthly_billing_units;
  const monthlyLabel =
    frequency === "manual"
      ? "Manual checks"
      : frequency === "paused"
        ? "Checks paused"
        : monthlyPages === null
          ? "excludes custom cron schedule"
          : `≈ ${monthlyPages} result pages/month`;
  const monthlyLine = `${monthlyLabel} at Top ${serpDepth}`;
  const calculatorHref = buildCostCalculatorHref({
    depth: serpDepth,
    devices,
    frequency,
    keywordCount,
    locationCount,
  });

  return (
    <OnboardingCostSummary>
      <div
        className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"
        data-analytics-mask
      >
        <span>
          <span className="block text-fg tabular-nums">
            Up to {pages} result {pages === 1 ? "page" : "pages"} per run · {locationCount}{" "}
            {locationCount === 1 ? "market" : "markets"}
          </span>
          <span className="block">{monthlyLine}</span>
        </span>
        {deploymentMode === "cloud" && keywordCount > 0 && calculatorHref !== null ? (
          <ExternalLink
            aria-label="Estimate provider cost"
            className="font-medium text-accent-text hover:underline"
            href={`${MARKETING_URL}${calculatorHref}`}
          >
            Estimate provider cost
          </ExternalLink>
        ) : null}
      </div>
    </OnboardingCostSummary>
  );
}
