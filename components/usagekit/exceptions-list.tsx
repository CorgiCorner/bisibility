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
import { serialize, useExceptionsView, useMeterBinding } from "@usagekit/react";
import type { ExceptionKind, ExceptionsInput, ExceptionsView } from "@usagekit/views";
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

export type ExceptionsListProps = {
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
  const labels = { ...exceptionsListLabels, ...custom };
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
              <TableHead className={head}>{labels.operation}</TableHead>
              <TableHead className={head}>{labels.provider}</TableHead>
              <TableHead className={head}>{labels.principal}</TableHead>
              <TableHead className={head}>{labels.kind}</TableHead>
              <TableHead className={head}>{labels.state}</TableHead>
              <TableHead className={`${head} text-right`}>{labels.age}</TableHead>
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
              view.rows.map((row) => (
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
            onClick={() => onNextPage(view.nextCursor!)}
          >
            {labels.next}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Reads exceptions with useExceptionsView inside a MeterProvider. */
export function ExceptionsListPanel({
  labels,
  formatAge: age,
  formatState,
  formatProvider,
  formatOperation,
  formatOperationId,
  metadata,
  details,
  ...input
}: ExceptionsInput & Omit<ExceptionsListProps, "view" | "onNextPage" | "onFirstPage" | "busy">) {
  const binding = useMeterBinding();
  const key = serialize([input, binding?.access]);
  const [page, setPage] = useState<{ key: string; meter: typeof binding; cursor: string } | null>(
    null,
  );
  const cursor =
    page?.key === key && page.meter?.meter === binding?.meter
      ? page.cursor || undefined
      : input.cursor;
  const query = { ...input };
  delete query.cursor;
  const result = useExceptionsView(cursor ? { ...query, cursor } : query);
  const [last, setLast] = useState<{
    key: string;
    meter: typeof binding;
    view: ExceptionsView;
  } | null>(null);
  const failed = result.state === "forbidden" || result.state === "unavailable";
  if (failed && last) setLast(null);
  else if (result.data && !failed && last?.view !== result.data)
    setLast({ key, meter: binding, view: result.data });
  const retained =
    !result.data &&
    result.state === "loading" &&
    last?.key === key &&
    last.meter?.meter === binding?.meter
      ? last.view
      : null;
  if (result.state === "unavailable" || result.state === "forbidden")
    return (
      <div className="space-y-3">
        <p
          role="alert"
          className={`rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted ${usageMotion.enter}`}
        >
          {result.state === "forbidden"
            ? (labels?.forbidden ?? exceptionsListLabels.forbidden)
            : (labels?.failed ?? exceptionsListLabels.failed)}
        </p>
        {cursor && result.state === "unavailable" && (
          <Button onClick={() => setPage({ key, meter: binding, cursor: "" })}>
            {labels?.first ?? exceptionsListLabels.first}
          </Button>
        )}
      </div>
    );
  return (
    <ExceptionsList
      view={result.data ?? retained}
      labels={labels}
      formatAge={age}
      formatState={formatState}
      formatProvider={formatProvider}
      formatOperation={formatOperation}
      formatOperationId={formatOperationId}
      metadata={metadata}
      details={details}
      busy={retained !== null}
      onNextPage={(cursor) => setPage({ key, meter: binding, cursor })}
      onFirstPage={cursor ? () => setPage({ key, meter: binding, cursor: "" }) : undefined}
    />
  );
}
