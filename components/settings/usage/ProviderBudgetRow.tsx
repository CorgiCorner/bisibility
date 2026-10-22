"use client";

import { BudgetRemaining } from "@/components/metering/BudgetRemaining";
import { BudgetTrafficBadge } from "@/components/metering/BudgetTrafficBadge";
import {
  BudgetHeading,
  BudgetValue,
  type BudgetValueKind,
} from "@/components/metering/BudgetValue";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { UsageStatus } from "@/components/usagekit/usage-motion";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";

export function ProviderBudgetRow({
  row,
  compact = false,
  onEdit,
}: {
  row: ProjectBudgetRow;
  compact?: boolean;
  onEdit?: () => void;
}) {
  const p = useUsagePresentation();
  const title =
    row.kind === "group"
      ? p.operation("project")
      : (row.display?.providerLabel ?? p.dimensions.connection);
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
          : estimated
            ? p.measurement.estimated
            : p.budget[row.level];
  const tone =
    !row.redacted && (row.level === "exceeded" || row.level === "warning") ? row.level : "neutral";
  const Wrapper = compact ? "div" : "li";
  return (
    <Wrapper
      className={`min-w-0 space-y-3 ${compact ? "" : "py-4 first:pt-0 last:pb-0"}`}
      data-budget-row={row.id}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {!compact && (
            <h3 className="break-words text-sm font-medium">
              {title}
              {row.unit === "customer_cents" ? ` · ${p.unit(row.unit)}` : ""}
            </h3>
          )}
          {!compact && row.display?.projectName && (
            <p className="text-xs text-fg-muted">{row.display.projectName}</p>
          )}
          <BudgetTrafficBadge traffic={row.traffic} compact />
        </div>
        <UsageStatus tone={tone}>{status}</UsageStatus>
      </div>
      {row.redacted ? (
        <p className="text-xs text-fg-muted">{p.budget.redacted}</p>
      ) : (
        <>
          <div className="min-w-0 overflow-x-auto">
            <dl className="grid w-max grid-cols-[repeat(4,7rem)] gap-3">
              {(["used", "reserved", "remaining", "limit"] as BudgetValueKind[]).map((kind) => (
                <div key={kind} className="min-w-0 space-y-1">
                  <dt className="text-xs text-fg-muted">
                    <BudgetHeading kind={kind} />
                  </dt>
                  <dd className="m-0 text-sm font-medium tabular-nums">
                    <BudgetValue
                      kind={kind}
                      level={row.level}
                      value={row.level === "unavailable" ? "unavailable" : row[kind]}
                      onEdit={onEdit}
                      monthly={row.window === "calendar_month"}
                    />
                    {kind === "remaining" && <BudgetRemaining row={row} />}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
            <span>{row.boundary.onExceed === "block" ? p.budget.block : p.budget.allow}</span>
            {row.boundary.onExceed === "allow" && row.boundary.hardLimit && (
              <span>
                {p.budget.hardLimit}: <BudgetValue kind="limit" value={row.boundary.hardLimit} />
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
    </Wrapper>
  );
}
