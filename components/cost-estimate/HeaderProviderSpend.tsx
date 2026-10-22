"use client";
import { BudgetRemaining } from "@/components/metering/BudgetRemaining";
import { BudgetHeading, BudgetValue } from "@/components/metering/BudgetValue";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Tooltip } from "@/components/ui/Tooltip";
import { UsageCapPill } from "@/components/usagekit/usage-cap-pill";
import type { WorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { HeaderBudgetScope } from "./HeaderBudgetScope";
import { headerBudgetSummary } from "./header-budget-summary";

export type HeaderProviderSpendProps = {
  projectRef: ProjectRef;
  summary: WorkspaceBudgetSummary | null;
};
export function HeaderProviderSpend({ projectRef, summary }: HeaderProviderSpendProps) {
  const t = useTranslations("projectCostEstimate.providerSpend");
  const p = useUsagePresentation();
  const preflight = useTranslations("shared.rankPreflight");
  const locale = useLocale();
  const compact = headerBudgetSummary(summary?.budgets.rows ?? []);
  const percent = new Intl.NumberFormat(locale).format(Math.floor(compact.percent ?? 0));
  const label = compact.unavailable
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
    ? `${appPath(projectRef, "integrations")}?tab=usage&budget=edit`
    : undefined;
  const details = (
    <div className="max-h-[60vh] max-w-[640px] space-y-3 overflow-auto text-left text-[11px] leading-snug">
      <table className="w-[38rem] table-fixed border-collapse text-[11px]">
        <caption className="caption-top pb-3 text-left opacity-75">{t("headerCapTooltip")}</caption>
        <thead>
          <tr className="text-[10px]">
            <th scope="col" className="w-40 pb-2 text-left font-medium">
              {preflight("budget")}
            </th>
            <th scope="col" className="whitespace-nowrap pb-2 pl-2 text-right font-medium">
              {p.budget.used}
            </th>
            <th
              scope="col"
              aria-label={p.budget.reserved}
              className="whitespace-nowrap pb-2 pl-2 text-right font-medium"
            >
              <BudgetHeading kind="reserved" />
            </th>
            <th scope="col" className="whitespace-nowrap pb-2 pl-2 text-right font-medium">
              {p.budget.remaining}
            </th>
            <th scope="col" className="whitespace-nowrap pb-2 pl-2 text-right font-medium">
              {p.budget.limit}
            </th>
          </tr>
        </thead>
        <tbody>
          {summary?.budgets.rows.map((row) => (
            <tr key={row.id} className="border-t border-border-soft align-top">
              {row.redacted ? (
                <td colSpan={5} className="py-2">
                  {p.budget.redacted}
                </td>
              ) : (
                <>
                  <th scope="row" className="py-2 text-left font-normal">
                    <HeaderBudgetScope row={row} />
                  </th>

                  <td className="py-2 pl-2 text-right tabular-nums">
                    <BudgetValue
                      kind="used"
                      value={row.level === "unavailable" ? "unavailable" : row.used}
                    />
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums">
                    <BudgetValue
                      kind="reserved"
                      value={row.level === "unavailable" ? "unavailable" : row.reserved}
                    />
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums">
                    <BudgetValue
                      level={row.level}
                      kind="remaining"
                      value={row.level === "unavailable" ? "unavailable" : row.remaining}
                    />
                    <BudgetRemaining row={row} />
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums">
                    <BudgetValue
                      kind="limit"
                      value={row.level === "unavailable" ? "unavailable" : row.limit}
                      href={editHref}
                      monthly={row.window === "calendar_month"}
                    />
                    {row.level !== "unavailable" &&
                      row.boundary.onExceed === "allow" &&
                      row.boundary.hardLimit && (
                        <span className="mt-1 block opacity-75">
                          {p.budget.hardLimit}:{" "}
                          <BudgetValue kind="limit" value={row.boundary.hardLimit} />
                        </span>
                      )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const href = `${appPath(projectRef, "integrations")}?tab=usage`;
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
          level={compact.level}
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
