"use client";

import {
  keywordCheckSummary,
  keywordMonthlyCheckSummary,
} from "@/components/onboarding/onboarding-fixtures";
import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { ExternalLink } from "@/components/ui";
import { buildCostCalculatorHref } from "@/lib/cost-estimate/calculator-query";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth, type SerpDevice } from "@/lib/serp/markets";
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
  frequency = "daily",
  keywordCount,
  locationCount,
  serpDepth = DEFAULT_SERP_DEPTH,
}: Readonly<KeywordImportSummaryProps>) {
  const deploymentMode = useDeploymentMode();
  const deviceCount = devices.length;
  const monthlyLine = `${keywordMonthlyCheckSummary(
    keywordCount,
    locationCount,
    deviceCount,
    frequency,
    cronExpression,
  )} at Top ${serpDepth}`;
  const calculatorHref = buildCostCalculatorHref({
    depth: serpDepth,
    devices,
    frequency,
    keywordCount,
    locationCount,
  });

  return (
    <OnboardingCostSummary>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <span>
          <span className="block font-mono text-fg">
            {keywordCheckSummary(keywordCount, locationCount, deviceCount)}
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
