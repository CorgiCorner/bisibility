"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { formatPaymentAmount } from "@/lib/action-payment/format";
import { formatDisplayDateTime } from "@/lib/dates/format";
import { useLocale, useTranslations } from "next-intl";
import type { ResearchEstimateView } from "./ResearchSearchCard";
import { nextBudgetResetAt } from "./research-workspace-model";

export function useResearchWorkspaceCopy(timeZone: string) {
  const errors = useSharedErrorMessages();
  const dateDisplay = useDateDisplay();
  const locale = useLocale();
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
      const payment = estimate.payments?.[0];
      if (!payment) return stateT("retry");
      if (payment.cache.state === "hit") return stateT("retryCached");
      return stateT("retryCost", { cost: formatPaymentAmount(payment.charge, locale) });
    },
  };
}
