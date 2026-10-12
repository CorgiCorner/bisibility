"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import { Button } from "@/components/ui/Button";
import { UsageCapPill, usageCapFromBudget } from "@/components/usagekit/usage-cap-pill";
import { UsageOverviewCard } from "@/components/usagekit/usage-overview-card";
import type { ProjectUsageViews } from "@/lib/metering/user-views";
import { appPath } from "@/lib/routing/app-path";
import { useProviderAction } from "@usagekit/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

export function ProviderUsageCard({
  budgetExplanation,
  canEditBudget,
  initialBudgetEditOpen = false,
  projectId,
  projectRef,
  data,
}: {
  budgetExplanation?: ReactNode;
  canEditBudget: boolean;
  initialBudgetEditOpen?: boolean;
  projectId: string;
  projectRef: string;
  data: ProjectUsageViews;
}) {
  const t = useTranslations("projectSettingsUsage.provider");
  const common = useTranslations("projectIntegrations.providerManagement");
  const p = useUsagePresentation();
  const action = useProviderAction();
  const [open, setOpen] = useState(initialBudgetEditOpen && canEditBudget);
  const bounds = data.budgets.map((row) =>
    usageCapFromBudget(row, {
      formatBound: p.bound,
      formatFigure: p.figure,
      formatUnit: p.unit,
      labels: p.budget,
    }),
  );
  const rank = (index: number) =>
    data.budgets[index].limit === "unlimited"
      ? 0
      : bounds[index].state === "unavailable" || bounds[index].percent === null
        ? 2
        : 1;
  const headlineIndex = bounds.reduce<number>((selected, bound, index) => {
    if (selected < 0 || rank(index) > rank(selected)) return index;
    if (rank(index) < rank(selected)) return selected;
    return (bound.percent ?? 0) > (bounds[selected].percent ?? 0) ? index : selected;
  }, -1);
  const headline = bounds[headlineIndex];
  const unavailable =
    data.status !== "available" ||
    data.budgets.some(
      (row) =>
        row.redacted ||
        row.level === "unavailable" ||
        [row.used, row.reserved, row.limit].some(
          (value) =>
            value === "unavailable" || (typeof value !== "string" && value.certainty === "unknown"),
        ),
    );
  const redacted = data.budgets.some((row) => row.redacted);
  const attentionRows = data.budgets.filter(
    (row) => row.level === "warning" || row.level === "exceeded",
  );
  const blocked = attentionRows.find(
    (row) => row.level === "exceeded" && row.boundary.onExceed === "block",
  );
  const attention = attentionRows.length > 0;
  const attentionMessage = attention
    ? t(blocked ? "attentionBlocked" : "attentionWarning", {
        bound: p.bound(blocked ?? attentionRows[0]),
        count: attentionRows.length,
      })
    : "";
  const budgetAction =
    canEditBudget || (action.ambiguous && action.canReconcile) ? (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!action.canReconcile}
        onClick={() => setOpen(true)}
      >
        {canEditBudget ? t("editBudget") : common("reconcile")}
      </Button>
    ) : null;
  return (
    <>
      {data.status === "restricted" ? (
        <div className="flex justify-end">{budgetAction}</div>
      ) : (
        <UsageOverviewCard
          id="provider-usage"
          size="md"
          title={t("title")}
          description={t("description")}
          labels={p.overview}
          metrics={[]}
          budget={{
            label: t("budgetUsed"),
            value:
              data.status === "available"
                ? data.budgets.length
                  ? redacted
                    ? p.budget.redacted
                    : headline?.state === "unavailable"
                      ? p.budget.unavailable
                      : (headline?.label ?? p.overview.unknown)
                  : p.budget.empty
                : p.budget.unavailable,
            percent: null,
            partial: !data.summary.complete,
            status: unavailable
              ? p.overview.unknown
              : !data.budgets.length
                ? p.budget.empty
                : attention
                  ? p.budget.warning
                  : p.budget.ok,
          }}
          introduction={budgetExplanation}
          action={budgetAction}
          notice={
            attention
              ? {
                  message: attentionMessage,
                  action: (
                    <Link href={appPath(projectRef, "integrations")}>
                      {t("connectionSettings")}
                    </Link>
                  ),
                }
              : undefined
          }
        >
          {data.budgets.map((row) => (
            <div key={row.id} className="py-2">
              <UsageCapPill
                {...usageCapFromBudget(row, {
                  formatBound: p.bound,
                  formatFigure: p.figure,
                  formatUnit: p.unit,
                  labels: p.budget,
                })}
                labels={{ unknown: p.overview.unknown, unavailable: p.budget.unavailable }}
              />
            </div>
          ))}
        </UsageOverviewCard>
      )}
      {open && (
        <BudgetEditModal
          connections={data.connections}
          projectId={projectId}
          projectRef={projectRef}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}
    </>
  );
}
