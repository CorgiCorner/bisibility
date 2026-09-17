"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { formatDisplayDateTime } from "@/lib/dates/format";
import { useFormatter, useTranslations } from "next-intl";
import type { ResearchEstimateView } from "./ResearchSearchCard";
import { formatResearchEstimateCents } from "./research-money";
import { nextBudgetResetAt, researchRetryPresentation } from "./research-workspace-model";

export function useResearchWorkspaceCopy(timeZone: string) {
  const dateDisplay = useDateDisplay();
  const format = useFormatter();
  const stateT = useTranslations("projectResearch.state");
  const recentT = useTranslations("projectResearch.recent");

  return {
    budgetBlockedTooltip: stateT("budgetBlockedTooltip"),
    budgetResetLabel: () =>
      formatDisplayDateTime(nextBudgetResetAt(timeZone), { ...dateDisplay, timeZone }),
    recentDisabledHint: recentT("disabledHint"),
    retryLabel: (estimate: ResearchEstimateView) => {
      const presentation = researchRetryPresentation(estimate);
      if (presentation.kind === "cached") return stateT("retryCached");
      if (presentation.kind === "plain") return stateT("retry");
      return stateT("retryCost", {
        cost: formatResearchEstimateCents(presentation.costCents, format.number),
      });
    },
  };
}
