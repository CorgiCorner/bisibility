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
import type { UsageTone } from "@/components/usagekit/usage-motion";
import { UsageStatus, usageMotion } from "@/components/usagekit/usage-motion";
import type { ExceptionKind, ExceptionsView } from "@usagekit/views";
import type { ReactNode } from "react";
import { useState } from "react";

export const exceptionsListLabels = {
  title: "Needs attention",
  next: "Next page",
  first: "First page",
  operation: "Operation",
  provider: "Provider",
  principal: "Principal",
  kind: "Exception",
  state: "State",
  age: "Age",
  reservation_expired: "Reservation expired",
  lease_expired: "Lease expired",
  pending: "Pending evidence",
  loading: "Loading exceptions.",
  empty: "No exceptions in this period.",
  forbidden: "You cannot view operations for this scope.",
  failed: "Exceptions are unavailable right now.",
};
export type ExceptionsListLabels = typeof exceptionsListLabels;

const kindTone: Record<ExceptionKind, UsageTone> = {
  lease_expired: "exceeded",
  reservation_expired: "warning",
  pending: "neutral",
};
const head = "h-10 px-4 text-xs font-medium text-fg-muted";
const cell = "px-4 py-3";

/** Seconds, minutes, hours or days; hosts pass formatAge for their own language. */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} d`;
}

import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import { SortableTableHead } from "@/components/ui/TableSortButton";
import { sortTableRows } from "@/components/ui/table-sorting";

export type ExceptionsListProps = {
  sortable?: boolean;
  view: ExceptionsView | null;
  labels?: Partial<ExceptionsListLabels>;
  formatAge?: (seconds: number) => string;
  formatState?: (state: ExceptionsView["rows"][number]["state"]) => ReactNode;
  formatProvider?: (provider: string) => ReactNode;
  formatOperation?: (operation: string) => ReactNode;
  formatOperationId?: (id: string) => ReactNode;
  onNextPage?: (cursor: string) => void;
  onFirstPage?: () => void;
  busy?: boolean;
  metadata?: ReactNode;
  details?: ReactNode;
};

/** Operations that need attention, with their lifecycle state and age at the view's asOf. */
export function ExceptionsList({
  view,
  sortable = false,
  labels: custom,
  formatAge: age = formatAge,
  formatState,
  formatProvider,
  formatOperation,
  formatOperationId,
  onNextPage,
  onFirstPage,
  busy = false,
  metadata,
  details,
}: ExceptionsListProps) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const labels = { ...exceptionsListLabels, ...custom };
  const columnHead = (field: string, label: string, align: "start" | "end" = "start") =>
    sortable ? (
      <SortableTableHead
        field={field}
        label={label}
        align={align}
        className={`${head} ${align === "end" ? "text-right" : ""}`}
        sorting={sorting}
        onSortingChange={setSorting}
      />
    ) : (
      <TableHead className={`${head} ${align === "end" ? "text-right" : ""}`}>{label}</TableHead>
    );
  const rows = sortTableRows(view?.rows ?? [], sortable ? sorting : null, (row, field) => {
    if (field === "operation") return row.operationId;
    if (field === "provider") return `${row.provider} ${row.operation}`;
    if (field === "principal") return row.principal;
    if (field === "kind") return labels[row.kind];
    if (field === "state") return row.state;
    return row.ageSeconds;
  });
  if (!view)
    return (
      <div role="status" className="rounded-xl border px-4 py-3 min-w-0 border-border">
        <span className="sr-only">{labels.loading}</span>
        <span
          aria-hidden
          className="block h-4 w-full max-w-sm rounded bg-fg/[0.07] animate-pulse motion-reduce:animate-none"
        />
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
    <div className="space-y-3">
      {metadata}
      <div className="rounded-xl border min-w-0 overflow-hidden border-border">
        <Table
          tabIndex={0}
          aria-busy={busy || undefined}
          aria-label={labels.title}
          className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid"
        >
          <TableHeader className="bg-bg-sunken">
            <TableRow className="hover:bg-transparent">
              {columnHead("operation", labels.operation)}
              {columnHead("provider", labels.provider)}
              {columnHead("principal", labels.principal)}
              {columnHead("kind", labels.kind)}
              {columnHead("state", labels.state)}
              {columnHead("age", labels.age, "end")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="text-sm px-4 py-8 text-center text-fg-muted">
                  {labels.empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.operationId}
                  data-kind={row.kind}
                  className="transition-[background-color,opacity] duration-300 starting:opacity-0 motion-reduce:transition-none"
                >
                  <TableCell className={`${cell} font-mono text-xs text-fg-muted`}>
                    {formatOperationId?.(row.operationId) ?? row.operationId}
                  </TableCell>
                  <TableCell className={cell}>
                    <span className="font-medium">
                      {formatProvider?.(row.provider) ?? row.provider}
                    </span>{" "}
                    <span className="text-fg-muted">
                      {formatOperation?.(row.operation) ?? row.operation}
                    </span>
                  </TableCell>
                  <TableCell className={cell}>{row.principal}</TableCell>
                  <TableCell className={cell}>
                    <UsageStatus tone={kindTone[row.kind]}>
                      {labels[row.kind as ExceptionKind]}
                    </UsageStatus>
                  </TableCell>
                  <TableCell className={`${cell} text-fg-muted`}>
                    {formatState?.(row.state) ?? row.state}
                  </TableCell>
                  <TableCell className={`${cell} text-right tabular-nums`}>
                    {age(row.ageSeconds)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {details}
      <div className="flex justify-end gap-2">
        {onFirstPage && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onFirstPage}>
            {labels.first}
          </Button>
        )}
        {onNextPage && view.nextCursor && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (view.nextCursor) onNextPage(view.nextCursor);
            }}
          >
            {labels.next}
          </Button>
        )}
      </div>
    </div>
  );
}
