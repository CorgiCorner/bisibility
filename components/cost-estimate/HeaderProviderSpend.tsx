"use client";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { Tooltip } from "@/components/ui/Tooltip";
import { UsageCapPill } from "@/components/usagekit/usage-cap-pill";
import type { WorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { headerBudgetFigure, headerBudgetSummary } from "./header-budget-summary";

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
  const amount = (value: import("@usagekit/views").Figure | "unlimited", lowerBound = false) => {
    if (value === "unlimited") return p.budget.unlimited;
    if (value === "unavailable") return p.budget.unavailable;
    if (value.certainty === "unknown") return p.budget.unknown;
    const formatted = lowerBound ? value : { ...value, certainty: "measured" as const };
    const text =
      headerBudgetFigure(formatted, locale, p.options) ??
      `${p.figure(value)} ${p.unit(value.unit)}`;
    return lowerBound && value.certainty === "estimated" ? `≥ ${text}` : text;
  };
  const scope = (row: import("@usagekit/views").BudgetRow) => {
    const target = row.kind === "group" ? p.operation("project") : row.target;
    const traffic =
      row.traffic.kind === "any"
        ? "any"
        : row.traffic.kind === "surface"
          ? row.traffic.surface
          : row.traffic.source;
    return `${target} · ${row.traffic.kind === "source" ? p.dimension("source", traffic) : p.operation(traffic)}`;
  };
  const details = (
    <div className="max-w-xs space-y-2 text-left">
      <p>{t("headerCapTooltip")}</p>
      {summary?.budgets.rows.map((row) => (
        <div key={row.id}>
          {row.redacted ? (
            p.budget.redacted
          ) : (
            <>
              <p className="font-medium">{scope(row)}</p>
              {row.level === "unavailable" ? (
                p.budget.unavailable
              ) : (
                <p>
                  {p.budget.used}: {amount(row.used, true)}; {p.budget.reserved}:{" "}
                  {amount(row.reserved)}; {p.budget.limit}: {amount(row.limit)}
                  {row.boundary.onExceed === "allow" && row.boundary.hardLimit && (
                    <>
                      ; {p.budget.hardLimit}: {amount(row.boundary.hardLimit)}
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      ))}
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
          href={`${href}&budget=edit`}
          label={t("headerNoCap")}
          ariaLabel={t("headerNoCapAria")}
          labels={labels}
          renderLink={renderLink}
          size="sm"
        />
      )}
    </div>
  );
}
