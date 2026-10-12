"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { formatDisplayDateTime } from "@/lib/dates/format";
import { useFormatter, useTranslations } from "next-intl";
import type { ResearchEstimateView } from "./ResearchSearchCard";
import { formatResearchEstimateCents } from "./research-money";
import { nextBudgetResetAt, researchRetryPresentation } from "./research-workspace-model";

export function useResearchWorkspaceCopy(timeZone: string) {
  const errors = useSharedErrorMessages();
  const dateDisplay = useDateDisplay();
  const format = useFormatter();
  const stateT = useTranslations("projectResearch.state");
  const sharedT = useTranslations("shared.errors");
  const recentT = useTranslations("projectResearch.recent");

  return {
    budgetTooltip: (
      state:
        | "wallet_budget_exhausted"
        | "budget_missing"
        | "budget_exhausted"
        | "usage_reconciliation_required"
        | null,
    ) =>
      state === "wallet_budget_exhausted"
        ? sharedT("walletBudgetExhausted")
        : state === "usage_reconciliation_required"
          ? errors.usageReconciliationRequired()
          : state === "budget_missing"
            ? errors.budgetMissing()
            : state === "budget_exhausted"
              ? stateT("budgetBlockedTooltip")
              : "",
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
