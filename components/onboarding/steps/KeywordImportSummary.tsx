"use client";

import {
  keywordCheckSummary,
  keywordMonthlyCheckSummary,
} from "@/components/onboarding/onboarding-fixtures";
import { formatEstimateCents, monthlyCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/markets";
import { docsLinkProps } from "@/lib/site/site";
import { OnboardingCostSummary } from "./OnboardingCostSummary";

type KeywordImportSummaryProps = {
  costPerCheckCents?: number | null;
  cronExpression?: string | null;
  deviceCount: number;
  frequency?: KeywordScheduleInput["frequency"];
  keywordCount: number;
  locationCount: number;
  monthlyCapCents?: number;
  serpDepth?: SerpDepth;
};

export function KeywordImportSummary({
  costPerCheckCents,
  cronExpression,
  deviceCount,
  frequency = "daily",
  keywordCount,
  locationCount,
  monthlyCapCents,
  serpDepth = DEFAULT_SERP_DEPTH,
}: Readonly<KeywordImportSummaryProps>) {
  const projectedCostCents = monthlyCostCentsFor(
    {
      depth: serpDepth,
      cronExpression,
      deviceCount,
      frequency,
      keywordCount,
      locationCount,
    },
    { overrideCents: costPerCheckCents ?? null, providerId: null },
  );
  const monthlyLine =
    projectedCostCents == null
      ? `${keywordMonthlyCheckSummary(
          keywordCount,
          locationCount,
          deviceCount,
          frequency,
          cronExpression,
        )} at Top ${serpDepth}`
      : `${keywordMonthlyCheckSummary(
          keywordCount,
          locationCount,
          deviceCount,
          frequency,
          cronExpression,
        )} at Top ${serpDepth} \u00b7 \u2248 ${formatEstimateCents(projectedCostCents)}/month`;
  const aboveCap =
    projectedCostCents != null && monthlyCapCents != null && projectedCostCents > monthlyCapCents;

  return (
    <OnboardingCostSummary>
      <span className="font-mono text-fg">
        {keywordCheckSummary(keywordCount, locationCount, deviceCount)}
      </span>
      <br />
      <span>{monthlyLine}</span>
      {aboveCap ? (
        <>
          <br />
          <span className="text-yellow">
            Above the monthly cost cap ({formatEstimateCents(monthlyCapCents)}) {"-"} checks pause
            once the cap is reached.{" "}
            <a
              className="underline"
              href="/docs/integrations#budget-cap"
              {...docsLinkProps("/docs/integrations#budget-cap")}
            >
              How budgets work
            </a>
            .
          </span>
        </>
      ) : null}
      <br />
      Each rank check is billed directly by the SERP provider.
      <br />
      Locations and devices selected in Tracking defaults apply to these keywords.
    </OnboardingCostSummary>
  );
}
