"use client";

import {
  keywordCheckSummary,
  keywordMonthlyCheckSummary,
} from "@/components/onboarding/onboarding-fixtures";
import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { buildCostCalculatorHref } from "@/lib/cost-estimate/calculator-query";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth, type SerpDevice } from "@/lib/serp/markets";
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
      <span className="font-mono text-fg">
        {keywordCheckSummary(keywordCount, locationCount, deviceCount)}
      </span>
      <br />
      <span>{monthlyLine}</span>
      {deploymentMode === "cloud" && calculatorHref && keywordCount > 0 ? (
        <>
          <br />
          <a className="font-medium text-accent-text hover:underline" href={calculatorHref}>
            Estimate provider cost
          </a>
        </>
      ) : null}
    </OnboardingCostSummary>
  );
}
