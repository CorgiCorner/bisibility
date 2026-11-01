"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import type { BudgetDenialReason } from "@/lib/metering/budget-denial";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";

export function OverviewBudgetNotice({
  reason,
  projectRef,
}: Readonly<{
  reason?: BudgetDenialReason;
  projectRef: ProjectRef;
}>) {
  const t = useTranslations("projectDashboard.noData");
  const kind =
    reason === "usage_reconciliation_required"
      ? "usageReview"
      : reason === "budget_missing"
        ? "budgetMissing"
        : "budgetReview";
  return (
    <AlertBanner
      title={t(`${kind}Title`)}
      detail={t(`${kind}Detail`)}
      action={{ href: `${appPath(projectRef, "providers")}?tab=usage`, label: t("reviewUsage") }}
      tint="yellow"
    />
  );
}
