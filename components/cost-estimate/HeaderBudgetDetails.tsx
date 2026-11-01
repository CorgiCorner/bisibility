"use client";

import { BudgetTrafficBadge } from "@/components/metering/BudgetTrafficBadge";
import { BudgetValue } from "@/components/metering/BudgetValue";
import { isCreditUnit, isMoneyUnit } from "@/components/metering/usage-number-format";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import { useTranslations } from "next-intl";
import { HeaderBudgetScope } from "./HeaderBudgetScope";
import { headerDetailRows } from "./header-budget-summary";

export function HeaderBudgetDetails({
  rows,
  partial,
  editHref,
}: Readonly<{
  rows: readonly ProjectBudgetRow[];
  partial: boolean;
  editHref?: string;
}>) {
  const t = useTranslations("projectCostEstimate.providerSpend");
  const p = useUsagePresentation();
  const shown = headerDetailRows(rows);
  return (
    <div className="w-72 max-w-[calc(100vw-4rem)] space-y-3 text-left text-xs leading-relaxed">
      <p className="m-0 font-medium">{t("headerDetailsTitle")}</p>
      <ul className="m-0 list-none divide-y divide-border-soft p-0">
        {shown.map((row) => {
          const unitLabel =
            row.unit === "units"
              ? (count: string) => p.providerUnit(row.unit, row.display?.providerLabel, count)
              : undefined;
          return (
            <li key={row.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="font-medium">
                  {row.kind === "connection" ? (
                    <HeaderBudgetScope row={row} />
                  ) : isCreditUnit(row.unit) ? (
                    t("headerCredits")
                  ) : isMoneyUnit(row.unit) ? (
                    t("headerOwnKeys")
                  ) : (
                    t("headerProject")
                  )}
                  {row.kind !== "connection" && row.traffic.kind !== "any" ? (
                    <BudgetTrafficBadge compact traffic={row.traffic} />
                  ) : null}
                </div>
                <span className="tabular-nums">
                  <BudgetValue kind="used" value={row.used} unitLabel={unitLabel} /> /{" "}
                  <BudgetValue
                    kind="limit"
                    value={row.limit}
                    unitLabel={unitLabel}
                    href={editHref}
                    monthly={row.window === "calendar_month"}
                  />
                </span>
              </div>
              <p className="m-0 text-fg-muted">
                {p.budget.reserved}:{" "}
                <BudgetValue kind="reserved" value={row.reserved} unitLabel={unitLabel} />
              </p>
              {row.boundary.onExceed === "allow" && row.boundary.hardLimit ? (
                <p className="m-0 text-fg-muted">
                  {p.budget.hardLimit}:{" "}
                  <BudgetValue kind="limit" value={row.boundary.hardLimit} unitLabel={unitLabel} />
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-fg-muted">
        {partial ? `${t("headerPartialDetail")} ` : null}
        {t("headerCapTooltip")}
      </p>
    </div>
  );
}
