"use client";
import { BudgetRemaining } from "@/components/metering/BudgetRemaining";
import { BudgetValue, type BudgetValueKind } from "@/components/metering/BudgetValue";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SortableTableHead } from "@/components/ui/TableSortButton";
import { sortTableRows } from "@/components/ui/table-sorting";
import { figureSortValue } from "@/components/usagekit/figure-sorting";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/usagekit/primitives/table";
import { UsageStatus } from "@/components/usagekit/usage-motion";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AdminProjectLabel } from "./AdminProjectLabel";

function hasHistoryGate(row: MeteringAdminData["budgets"][number]) {
  return (
    !row.redacted &&
    row.level !== "unavailable" &&
    row.unit === "paid_attempts" &&
    row.boundary.onExceed === "block" &&
    typeof row.limit === "object" &&
    row.limit.certainty !== "unknown" &&
    /^0+(?:\.0+)?$/.test(row.limit.text)
  );
}

export function AdminBudgetTable({
  rows,
  references,
  busy,
}: {
  rows: MeteringAdminData["budgets"];
  busy?: boolean;
  references?: MeteringAdminData["references"];
}) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const p = useUsagePresentation();
  const t = useTranslations("instanceAdmin.metering");
  const sortedRows = sortTableRows(rows, sorting, (row, field) => {
    if (field === "scope") {
      const connection = references?.connections[row.target];
      return `${references?.projects[row.target] ?? connection?.project ?? (row.kind === "group" ? t("project") : p.dimensions.connection)} ${connection?.provider ?? ""} ${row.target}`;
    }
    if (field === "status")
      return hasHistoryGate(row)
        ? t("historyBlocked")
        : `${p.budget[row.level]} ${row.boundary.onExceed === "block" ? p.budget.block : p.budget.allow}`;
    if (field === "resets") return row.resetsAt ? Date.parse(row.resetsAt) : undefined;
    if (row.redacted || row.level === "unavailable") return undefined;
    return ["used", "reserved", "remaining", "limit"].includes(field)
      ? figureSortValue(row[field as BudgetValueKind])
      : undefined;
  });

  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-border">
      <Table
        aria-label={t("budgetsHeading")}
        tabIndex={0}
        aria-busy={busy || undefined}
        className="min-w-[74rem] table-fixed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid"
      >
        <TableHeader className="bg-bg-sunken">
          <TableRow>
            <SortableTableHead
              className="w-72 px-4 text-xs"
              field="scope"
              label={t("scope")}
              sorting={sorting}
              onSortingChange={setSorting}
            />
            {(["used", "reserved", "remaining", "limit"] as BudgetValueKind[]).map((kind) => (
              <SortableTableHead
                key={kind}
                className="w-32 px-4 text-right text-xs"
                field={kind}
                label={p.budget[kind]}
                align="end"
                sorting={sorting}
                onSortingChange={setSorting}
              >
                {kind === "reserved" ? <InfoTooltip text={p.budget.reservedHint} /> : null}
              </SortableTableHead>
            ))}
            <SortableTableHead
              className="px-4 text-xs"
              field="status"
              label={t("status")}
              sorting={sorting}
              onSortingChange={setSorting}
            />
            <SortableTableHead
              className="px-4 text-xs"
              field="resets"
              label={p.budget.resets}
              sorting={sorting}
              onSortingChange={setSorting}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            sortedRows.map((row) => {
              const ref = references?.connections[row.target];
              const name = references?.projects[row.target] ?? ref?.project;
              const historyGate = hasHistoryGate(row);
              const tone = historyGate
                ? "warning"
                : row.level === "ok"
                  ? "positive"
                  : row.level === "warning"
                    ? "warning"
                    : row.level === "exceeded"
                      ? "exceeded"
                      : "unknown";
              return (
                <TableRow key={row.id}>
                  <TableCell className="min-w-60 max-w-80 whitespace-normal break-words px-4 py-3">
                    <div className="font-medium">
                      <AdminProjectLabel
                        value={
                          name ?? (row.kind === "group" ? t("project") : p.dimensions.connection)
                        }
                      />
                    </div>
                    {row.redacted && (
                      <p className="mt-1 text-xs text-fg-muted">{p.budget.redacted}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                      {ref?.provider && <span>{ref.provider}</span>}
                      <IdChip value={row.target} truncate="middle" size="xs" />
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      {p
                        .bound({ ...row, target: "project", kind: "group" })
                        .split(" · ")
                        .slice(1)
                        .join(" · ")}
                    </p>
                  </TableCell>
                  {(["used", "reserved", "remaining", "limit"] as BudgetValueKind[]).map(
                    (kind, i) => (
                      <TableCell key={i} className="px-4 py-3 text-right tabular-nums">
                        {row.redacted ? (
                          p.budget.unavailable
                        ) : (
                          <BudgetValue
                            value={row.level === "unavailable" ? "unavailable" : row[kind]}
                            kind={kind}
                            level={row.level}
                            monthly={row.window === "calendar_month"}
                          />
                        )}
                        {kind === "remaining" && <BudgetRemaining row={row} />}
                        {i === 3 &&
                          row.boundary.onExceed === "allow" &&
                          row.boundary.hardLimit &&
                          !row.redacted && (
                            <p className="mt-1 text-xs text-fg-muted">
                              {p.budget.hardLimit}:{" "}
                              <BudgetValue kind="limit" value={row.boundary.hardLimit} />
                            </p>
                          )}
                      </TableCell>
                    ),
                  )}
                  <TableCell className="px-4 py-3">
                    <UsageStatus tone={tone}>
                      {historyGate
                        ? t("historyBlocked")
                        : row.level === "unavailable"
                          ? p.budget.unavailable
                          : p.budget[row.level]}
                    </UsageStatus>
                    <p className="mt-1 text-xs text-fg-muted">
                      {historyGate
                        ? t("historyBlockedHint")
                        : row.boundary.onExceed === "block"
                          ? p.budget.block
                          : p.budget.allow}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-fg-muted tabular-nums">
                    {row.resetsAt ? (
                      <time dateTime={row.resetsAt}>{p.date(row.resetsAt)}</time>
                    ) : (
                      p.budget.noReset
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                {p.budget.empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
