"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Tooltip } from "@/components/ui/Tooltip";
import { UsageCapPill } from "@/components/usagekit/usage-cap-pill";
import type { WorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { HeaderBudgetDetails } from "./HeaderBudgetDetails";
import { headerBudgetSummary } from "./header-budget-summary";

export type HeaderProviderSpendProps = {
  projectRef: ProjectRef;
  summary: WorkspaceBudgetSummary | null;
};
export function HeaderProviderSpend({ projectRef, summary }: HeaderProviderSpendProps) {
  const t = useTranslations("projectCostEstimate.providerSpend");
  const p = useUsagePresentation();
  const locale = useLocale();
  const compact = headerBudgetSummary(summary?.budgets.rows ?? []);
  const percent = new Intl.NumberFormat(locale).format(Math.floor(compact.percent ?? 0));
  const needsReview = compact.partial && summary?.paidWorkBlocked === true;
  const label = needsReview
    ? t("headerReviewRequired")
    : compact.unavailable
      ? t("headerUnavailable")
      : compact.level === "exceeded"
        ? t("headerExceeded")
        : compact.level === "warning" && compact.percent === null
          ? t("headerWarning")
          : compact.unlimited
            ? t("headerNoLimit")
            : compact.percent === null || (compact.partial && compact.percent === 0)
              ? t("headerUsageUnknown")
              : compact.percent > 0 && compact.percent < 1
                ? t(compact.partial ? "headerAtLeastUnderOne" : "headerUnderOne")
                : t(compact.partial ? "headerAtLeastUsed" : "headerUsed", { percent });
  const editHref = summary?.canEditBudget
    ? `${appPath(projectRef, "providers")}?tab=usage&budget=edit`
    : undefined;
  const details = (
    <HeaderBudgetDetails
      rows={summary?.budgets.rows ?? []}
      partial={compact.partial}
      editHref={editHref}
    />
  );
  const href = `${appPath(projectRef, "providers")}?tab=usage`;
  const labels = { unknown: t("headerUsageUnknown"), unavailable: t("headerUnavailable") };
  const renderLink = (
    props: Parameters<
      NonNullable<import("@/components/usagekit/usage-cap-pill").UsageCapPillProps["renderLink"]>
    >[0],
  ) => <Link {...props} />;
  const renderTooltip = (trigger: import("react").ReactNode) => (
    <Tooltip
      content={details}
      tone="surface"
      interactive
      semantics="description"
      placement="bottom"
      wrapperClassName="items-center"
    >
      {trigger}
    </Tooltip>
  );
  if (
    summary?.status.state === "forbidden" ||
    (summary && !summary.eligible && summary.status.state !== "unavailable")
  )
    return null;
  const unavailable = !summary || summary.status.state === "unavailable";
  return (
    <div className="hidden max-w-56 shrink-0 self-center md:flex md:items-center">
      {unavailable ? (
        <UsageCapPill state="unavailable" size="sm" labels={labels} />
      ) : summary.budgets.rows.length ? (
        <UsageCapPill
          state="ready"
          href={href}
          label={label}
          ariaLabel={t("headerUsageAria", {
            status: label,
          })}
          percent={compact.partial && compact.percent === 0 ? null : compact.percent}
          partial={compact.partial}
          level={needsReview ? "warning" : compact.level}
          renderLink={renderLink}
          renderTooltip={renderTooltip}
          labels={labels}
          size="sm"
        />
      ) : (
        <UsageCapPill
          state="ready"
          href={summary.canEditBudget ? `${href}&budget=edit` : undefined}
          label={summary.canEditBudget ? t("headerNoCap") : p.budget.noLimit}
          ariaLabel={summary.canEditBudget ? t("headerNoCapAria") : p.budget.noLimit}
          labels={labels}
          renderLink={renderLink}
          size="sm"
        />
      )}
    </div>
  );
}
