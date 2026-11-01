"use client";

import { Button } from "@/components/usagekit/primitives/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/usagekit/primitives/table";
import { UsageSpinner, UsageStatus, usageMotion } from "@/components/usagekit/usage-motion";
import type { Figure, UsageView } from "@usagekit/views";
import type { ReactNode } from "react";
import { useState } from "react";
import { certaintyTone, usageTableFigure as figure } from "./usage-table-format";

export const usageTableLabels = {
  title: "Usage detail",
  funding: "Funding source",
  byok: "Own key",
  platform: "Platform funded",
  cost: "Cost",
  customerCharges: "Customer charges",
  cents: "cents",
  certainty: "Certainty",
  unknownOperations: "Unknown operations",
  measured: "Measured",
  estimated: "Estimated",
  unknown: "Unknown",
  unavailable: "Unavailable",
  loading: "Loading usage.",
  empty: "No usage in this period.",
  forbidden: "You cannot view usage for this scope.",
  failed: "Usage is unavailable right now.",
  next: "Next page",
  first: "First page",
};
export type UsageTableLabels = typeof usageTableLabels;

const frame = "rounded-xl border min-w-0 overflow-hidden border-border";
const head = "h-10 px-4 text-xs font-medium text-fg-muted";
const cell = "px-4 py-3";

import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import { SortableTableHead } from "@/components/ui/TableSortButton";
import { decimalSortValue, sortTableRows } from "@/components/ui/table-sorting";
import { figureSortValue } from "./figure-sorting";

export type UsageTableProps = {
  sortable?: boolean;
  dimensionSortValue?: (dimension: string, value: string, row: UsageView["rows"][number]) => string;
  view: UsageView | null;
  labels?: Partial<UsageTableLabels>;
  hideMeasured?: boolean;
  /** Column headings per dimension; the dimension name is the default. */
  dimensionLabels?: Partial<Record<string, string>>;
  unitLabels?: Partial<Record<string, string>>;
  onNextPage?: (cursor: string) => void;
  onFirstPage?: () => void;
  /** A newer page is loading; the current rows stay visible but dimmed. */
  busy?: boolean;
  formatFigure?: (value: Exclude<Figure, "unavailable">) => string;
  formatUnit?: (unit: string, count?: string) => string;
  formatDimension?: (dimension: string, value: string, row: UsageView["rows"][number]) => ReactNode;
  showFunding?: boolean;
  formatFunding?: (source: UsageView["rows"][number]["fundingSource"]) => ReactNode;
  metadata?: ReactNode;
  details?: ReactNode;
};

/** Renders one UsageView page. Amounts are the view model's exact text, never recomputed. */
export function UsageTable({
  view,
  sortable = false,
  dimensionSortValue,
  labels: custom,
  hideMeasured = false,
  dimensionLabels = {},
  unitLabels = {},
  onNextPage,
  onFirstPage,
  busy = false,
  formatFigure,
  formatUnit,
  formatDimension,
  showFunding = false,
  formatFunding,
  metadata,
  details,
}: UsageTableProps) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const labels = { ...usageTableLabels, ...custom };
  const columnHead = (field: string, label: string, align: "start" | "end" = "start") =>
    sortable ? (
      <SortableTableHead
        key={field}
        field={field}
        label={label}
        align={align}
        className={`${head} ${align === "end" ? "text-right" : ""}`}
        sorting={sorting}
        onSortingChange={setSorting}
      />
    ) : (
      <TableHead key={field} className={`${head} ${align === "end" ? "text-right" : ""}`}>
        {label}
      </TableHead>
    );
  const rows = sortTableRows(view?.rows ?? [], sortable ? sorting : null, (row, field) => {
    if (field.startsWith("dimension:")) {
      const key = field.slice(10);
      const value = row.dimensions[key] ?? "";
      return dimensionSortValue?.(key, value, row) ?? value;
    }
    if (field.startsWith("unit:")) return figureSortValue(row.units[field.slice(5)]);
    if (field === "cost") return figureSortValue(row.cost);
    if (field === "certainty") return labels[row.certainty];
    if (field === "funding") return labels[row.fundingSource];
    return decimalSortValue(row.unknownOperations);
  });
  if (!view)
    return (
      <div role="status" className={frame}>
        <span className="sr-only">{labels.loading}</span>
        {[0, 1, 2].map((row) => (
          <span
            key={row}
            aria-hidden
            className="px-4 py-3 block border-b border-border last:border-0"
          >
            <span className="block h-4 w-full max-w-md rounded bg-fg/[0.07] animate-pulse motion-reduce:animate-none" />
          </span>
        ))}
      </div>
    );
  if (view.state === "forbidden" || view.state === "unavailable")
    return (
      <p
        role="status"
        className={`rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted ${usageMotion.enter}`}
      >
        {view.state === "forbidden" ? labels.forbidden : labels.failed}
      </p>
    );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {metadata}
      <div className={frame}>
        <Table
          tabIndex={0}
          aria-label={labels.title}
          aria-busy={busy || undefined}
          className={`focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid ${busy ? "opacity-60" : ""} ${usageMotion.settle}`}
        >
          <TableHeader className="bg-bg-sunken">
            <TableRow className="hover:bg-transparent">
              {view.groupBy.map((d) => columnHead(`dimension:${d}`, dimensionLabels[d] ?? d))}
              {showFunding && columnHead("funding", labels.funding)}
              {view.units.map((unit) =>
                columnHead(
                  `unit:${unit}`,
                  unitLabels[unit] ??
                    formatUnit?.(unit) ??
                    (unit === "customer_cents" ? labels.customerCharges : unit),
                  "end",
                ),
              )}
              {columnHead("cost", labels.cost, "end")}
              {columnHead("certainty", labels.certainty)}
              {columnHead("unknownOperations", labels.unknownOperations, "end")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.state === "empty" ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={view.groupBy.length + view.units.length + 3 + (showFunding ? 1 : 0)}
                  className="text-sm px-4 py-8 text-center text-fg-muted"
                >
                  {labels.empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.key}
                  className="transition-[background-color,opacity] duration-300 starting:opacity-0 motion-reduce:transition-none"
                >
                  {view.groupBy.map((d) => (
                    <TableCell key={d} className={`${cell} font-medium`}>
                      {formatDimension?.(d, row.dimensions[d] ?? "", row) ??
                        row.dimensions[d] ??
                        ""}
                    </TableCell>
                  ))}
                  {showFunding && (
                    <TableCell className={cell}>
                      {formatFunding?.(row.fundingSource) ?? labels[row.fundingSource]}
                    </TableCell>
                  )}
                  {view.units.map((unit) => (
                    <TableCell key={unit} className={`${cell} text-right tabular-nums`}>
                      {figure(row.units[unit] ?? "unavailable", labels, {
                        formatFigure,
                        formatUnit,
                      })}
                    </TableCell>
                  ))}
                  <TableCell className={`${cell} text-right tabular-nums`}>
                    {figure(row.cost, labels, { formatFigure, formatUnit })}
                  </TableCell>
                  <TableCell className={cell}>
                    {(!hideMeasured || row.certainty !== "measured") && (
                      <UsageStatus tone={certaintyTone[row.certainty]}>
                        {labels[row.certainty]}
                      </UsageStatus>
                    )}
                  </TableCell>
                  <TableCell
                    className={`${cell} text-right tabular-nums ${row.unknownOperations === "0" ? "text-fg-muted" : "font-medium"}`}
                  >
                    {row.unknownOperations}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {details}
      {(onFirstPage || (onNextPage && view.nextCursor)) && (
        <div className="flex justify-end gap-2">
          {onFirstPage && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onFirstPage}>
              {labels.first}
            </Button>
          )}
          {onNextPage && view.nextCursor && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (view.nextCursor) onNextPage(view.nextCursor);
              }}
            >
              {busy && <UsageSpinner />}
              {labels.next}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
