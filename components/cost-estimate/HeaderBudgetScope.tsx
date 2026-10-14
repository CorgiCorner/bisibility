"use client";

import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";

/** Labels are localized; names come from the authorized host display projection. */
export function HeaderBudgetScope({ row }: { row: ProjectBudgetRow }) {
  const p = useUsagePresentation();
  const target = row.kind === "group" ? p.operation("project") : p.dimensions.connection;
  const traffic =
    row.traffic.kind === "any"
      ? "any"
      : row.traffic.kind === "surface"
        ? row.traffic.surface
        : row.traffic.source;
  const title = row.kind === "group" ? target : (row.display?.providerLabel ?? target);
  const trafficLabel =
    row.traffic.kind === "source" ? p.dimension("source", traffic) : p.operation(traffic);
  return (
    <p className="space-y-0.5">
      <span className="block font-medium">{title}</span>
      {row.display?.projectName && (
        <span className="block text-fg-muted">{row.display.projectName}</span>
      )}
      <span className="block text-fg-muted">{trafficLabel}</span>
    </p>
  );
}
