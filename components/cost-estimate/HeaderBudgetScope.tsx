"use client";

import { BudgetTrafficBadge } from "@/components/metering/BudgetTrafficBadge";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";

/** Labels are localized; names come from the authorized host display projection. */
export function HeaderBudgetScope({ row }: { row: ProjectBudgetRow }) {
  const p = useUsagePresentation();
  const target = row.kind === "group" ? p.operation("project") : p.dimensions.connection;
  const title = row.kind === "group" ? target : (row.display?.providerLabel ?? target);
  return (
    <div className="min-w-0 space-y-0.5 text-[11px] leading-snug">
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-medium">{title}</span>
        {row.kind === "group" && row.display?.projectName && (
          <span className="opacity-75">{row.display.projectName}</span>
        )}
      </span>
      <BudgetTrafficBadge traffic={row.traffic} />
    </div>
  );
}
