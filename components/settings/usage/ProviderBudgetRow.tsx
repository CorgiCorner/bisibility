"use client";

import { BudgetTrafficBadge } from "@/components/metering/BudgetTrafficBadge";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { usageCapFromBudget } from "@/components/usagekit/usage-cap-pill";
import { UsageMeter } from "@/components/usagekit/usage-meter";
import { UsageStatus } from "@/components/usagekit/usage-motion";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import type { Figure } from "@usagekit/views";

export function ProviderBudgetRow({ row }: { row: ProjectBudgetRow }) {
  const p = useUsagePresentation();
  const cap = usageCapFromBudget(row, { formatFigure: p.figure, formatUnit: p.unit });
  const title =
    row.kind === "group"
      ? p.operation("project")
      : (row.display?.providerLabel ?? p.dimensions.connection);
  const traffic =
    row.traffic.kind === "any"
      ? p.operation("any")
      : row.traffic.kind === "surface"
        ? p.operation(row.traffic.surface)
        : p.dimension("source", row.traffic.source);
  const format = (value: Figure | "unlimited") => {
    if (value === "unlimited") return p.budget.unlimited;
    if (value === "unavailable") return p.budget.unavailable;
    if (value.certainty === "unknown") return p.budget.unknown;
    return [value.certainty === "estimated" ? "≈" : "", p.figure(value), p.unit(value.unit)]
      .filter(Boolean)
      .join(" ");
  };
  const uncertain = [row.used, row.reserved, row.limit].some(
    (value) =>
      value === "unavailable" || (typeof value !== "string" && value.certainty === "unknown"),
  );
  const estimated = [row.used, row.reserved, row.remaining, row.limit].some(
    (value) => typeof value !== "string" && value.certainty === "estimated",
  );
  const status = row.redacted
    ? p.budget.unknown
    : row.level === "unavailable"
      ? p.budget.unavailable
      : row.level === "exceeded" || row.level === "warning"
        ? p.budget[row.level]
        : uncertain
          ? p.budget.unknown
          : row.level === "ok" && estimated
            ? p.measurement.estimated
            : p.budget[row.level];
  const values = [
    {
      label: p.budget.used,
      amount: row.level === "unavailable" ? ("unavailable" as const) : row.used,
    },
    { label: p.budget.reserved, amount: row.reserved },
    { label: p.budget.remaining, amount: row.remaining },
    { label: p.budget.limit, amount: row.limit },
  ];
  const tone =
    !row.redacted && (row.level === "exceeded" || row.level === "warning") ? row.level : "neutral";
  return (
    <li className="min-w-0 space-y-3 py-4 first:pt-0 last:pb-0" data-budget-row={row.id}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="break-words text-sm font-medium">{title}</h3>
          {row.display?.projectName && (
            <p className="break-words text-xs text-fg-muted">{row.display.projectName}</p>
          )}
          <BudgetTrafficBadge traffic={row.traffic} />
        </div>
        <UsageStatus tone={tone}>{status}</UsageStatus>
      </div>
      {row.redacted ? (
        <p className="text-sm text-fg-muted">{p.budget.redacted}</p>
      ) : (
        <>
          <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {values.map(({ label, amount }) => (
              <div key={label} className="min-w-0 space-y-1">
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd
                  aria-label={
                    typeof amount !== "string" && amount.certainty === "estimated"
                      ? `${p.measurement.estimated}: ${format(amount)}`
                      : undefined
                  }
                  className="break-words text-base font-semibold leading-snug tabular-nums"
                >
                  {format(amount)}
                </dd>
              </div>
            ))}
          </dl>
          <UsageMeter
            size="md"
            percent={cap.percent ?? null}
            partial={cap.partial}
            level={cap.level}
            label={`${title}, ${traffic}`}
            valueText={cap.label}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
            <span>{row.boundary.onExceed === "block" ? p.budget.block : p.budget.allow}</span>
            {row.boundary.onExceed === "allow" && row.boundary.hardLimit && (
              <span>
                {p.budget.hardLimit}: {format(row.boundary.hardLimit)}
              </span>
            )}
            {row.resetsAt && (
              <span>
                {p.budget.resets} <time dateTime={row.resetsAt}>{p.date(row.resetsAt)}</time>
              </span>
            )}
          </div>
        </>
      )}
    </li>
  );
}
