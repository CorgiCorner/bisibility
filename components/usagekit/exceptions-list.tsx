"use client";
import { Button } from "@/components/usagekit/primitives/button";
import { usageMotion } from "@/components/usagekit/usage-motion";
import { serialize, useExceptionsView, useMeterBinding } from "@usagekit/react";
import type { ExceptionsInput, ExceptionsView } from "@usagekit/views";
import { useState } from "react";
import {
  ExceptionsList,
  type ExceptionsListProps,
  exceptionsListLabels,
} from "./exceptions-list-view";

export {
  ExceptionsList,
  type ExceptionsListLabels,
  type ExceptionsListProps,
  exceptionsListLabels,
  formatAge,
} from "./exceptions-list-view";

/** Reads exceptions with useExceptionsView inside a MeterProvider. */
export function ExceptionsListPanel({
  labels,
  sortable,
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
      sortable={sortable}
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
