"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { ProjectUsageViews } from "@/lib/metering/user-views";
import { appPath } from "@/lib/routing/app-path";
import { useProviderAction } from "@usagekit/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  type HostedBudgetLabels,
  ProviderBudgetLists,
  visibleBudgetRows,
} from "./ProviderBudgetLists";

export function ProviderUsageCard({
  hostedBudgetLabels,
  canEditBudget,
  initialBudgetEditOpen = false,
  projectId,
  projectRef,
  data,
}: {
  hostedBudgetLabels?: HostedBudgetLabels;
  canEditBudget: boolean;
  initialBudgetEditOpen?: boolean;
  projectId: string;
  projectRef: string;
  data: ProjectUsageViews;
}) {
  const t = useTranslations("projectSettingsUsage.provider");
  const common = useTranslations("projectIntegrations.providerManagement");
  const p = useUsagePresentation();
  const budgetScope = p.bound;
  const action = useProviderAction();
  const [open, setOpen] = useState(initialBudgetEditOpen && canEditBudget);
  const attentionRows = visibleBudgetRows(data).filter(
    (row) => row.level === "warning" || row.level === "exceeded",
  );
  const blocked = attentionRows.find(
    (row) => row.level === "exceeded" && row.boundary.onExceed === "block",
  );
  const attention = attentionRows.length > 0;
  const attentionMessage = attention
    ? t(blocked ? "attentionBlocked" : "attentionWarning", {
        bound: budgetScope(blocked ?? attentionRows[0]),
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
        <Card id="provider-usage" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <SectionTitle>{t("title")}</SectionTitle>
              <p className="text-xs leading-relaxed text-fg-muted">{t("description")}</p>
            </div>
            {budgetAction}
          </div>
          {attention && (
            <div
              role="alert"
              className={`space-y-1 rounded-lg border p-3 text-sm ${blocked ? "border-red/30 bg-red/5" : "border-yellow/30 bg-yellow/5"}`}
            >
              <p>{attentionMessage}</p>
              <Link href={appPath(projectRef, "integrations")}>{t("connectionSettings")}</Link>
            </div>
          )}
          {data.status !== "available" ? (
            <p role="status" className="text-sm text-fg-muted">
              {p.budget.unavailable}
            </p>
          ) : !data.budgets.length ? (
            <p role="status" className="text-sm text-fg-muted">
              {p.budget.empty}
            </p>
          ) : (
            <ProviderBudgetLists
              data={data}
              hostedBudgetLabels={hostedBudgetLabels}
              onEdit={canEditBudget && action.canReconcile ? () => setOpen(true) : undefined}
            />
          )}
        </Card>
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
