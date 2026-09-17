"use client";

import { EstimateStatus } from "@/components/cost-estimate/EstimateStatus";
import { useCostEstimate } from "@/components/cost-estimate/useCostEstimate";
import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { ExternalLink } from "@/components/ui/ExternalLink";
import {
  buildCostCalculatorHref,
  COST_CALCULATOR_PATH,
  withCostCalculatorPath,
} from "@/lib/cost-estimate/calculator-query";
import { DEFAULT_ONBOARDING_FREQUENCY } from "@/lib/onboarding/defaults";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth, type SerpDevice } from "@/lib/serp/constants";
import { MARKETING_URL } from "@/lib/site/site";
import { useTranslations } from "next-intl";
import { OnboardingCostSummary } from "./OnboardingCostSummary";

type KeywordImportSummaryProps = {
  calculatorPath?: string;
  cronExpression?: string | null;
  devices: readonly SerpDevice[];
  frequency?: KeywordScheduleInput["frequency"];
  keywordCount: number;
  locationCount: number;
  serpDepth?: SerpDepth;
};

export function KeywordImportSummary({
  calculatorPath = COST_CALCULATOR_PATH,
  cronExpression,
  devices,
  frequency = DEFAULT_ONBOARDING_FREQUENCY,
  keywordCount,
  locationCount,
  serpDepth = DEFAULT_SERP_DEPTH,
}: Readonly<KeywordImportSummaryProps>) {
  const t = useTranslations("onboarding.keywordSummary");
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
  const monthlySchedule =
    frequency === "manual"
      ? "manual"
      : frequency === "paused"
        ? "paused"
        : monthlyPages === null
          ? "custom"
          : "monthly";
  const monthlyLine = t("monthlyLine", {
    depth: serpDepth,
    pages: monthlyPages ?? 0,
    schedule: monthlySchedule,
  });
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
            {t("perRun", { markets: locationCount, pages })}
          </span>
          <span className="block">{monthlyLine}</span>
        </span>
        {deploymentMode === "cloud" && keywordCount > 0 && calculatorHref !== null ? (
          <ExternalLink
            aria-label={t("estimate")}
            className="font-medium text-accent-text hover:underline"
            href={`${MARKETING_URL}${withCostCalculatorPath(calculatorHref, calculatorPath)}`}
          >
            {t("estimate")}
          </ExternalLink>
        ) : null}
      </div>
    </OnboardingCostSummary>
  );
}
