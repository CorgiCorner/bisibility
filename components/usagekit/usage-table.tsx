"use client";
import { Button } from "@/components/usagekit/primitives/button";
import { usageMotion } from "@/components/usagekit/usage-motion";
import type { Meter, UsageQuery } from "@usagekit/core";
import { serialize, useMeterBinding, useUsageView } from "@usagekit/react";
import type { UsageView } from "@usagekit/views";
import { useState } from "react";
import { UsageTable, type UsageTableProps, usageTableLabels } from "./usage-table-view";

export {
  UsageTable,
  type UsageTableLabels,
  type UsageTableProps,
  usageTableLabels,
} from "./usage-table-view";

/** Reads the view with useUsageView inside a MeterProvider and pages with the cursor. */
export function UsageTablePanel({
  labels,
  sortable,
  dimensionSortValue,
  hideMeasured,
  dimensionLabels,
  unitLabels,
  formatFigure,
  formatUnit,
  formatDimension,
  showFunding,
  formatFunding,
  metadata,
  details,
  ...query
}: Omit<UsageQuery, "cursor"> &
  Omit<UsageTableProps, "view" | "onNextPage" | "onFirstPage" | "busy">) {
  const binding = useMeterBinding();
  const key = serialize([query, binding?.access]);
  const [page, setPage] = useState<{
    key: string;
    meter: Meter | undefined;
    cursor: string;
  } | null>(null);
  const cursor = page?.key === key && page.meter === binding?.meter ? page.cursor : undefined;
  const setCursor = (cursor: string) => setPage({ key, meter: binding?.meter, cursor });
  const result = useUsageView(cursor ? { ...query, cursor } : query);
  // The last readable page of this query and binding stays visible while another page loads.
  const [last, setLast] = useState<{
    key: string;
    meter: Meter | undefined;
    view: UsageView;
  } | null>(null);
  const failed = result.state === "forbidden" || result.state === "unavailable";
  // A failed read drops the retained page, so a later reload never shows data it superseded.
  if (failed && last) setLast(null);
  else if (result.data && !failed && last?.view !== result.data)
    setLast({ key, meter: binding?.meter, view: result.data });
  const retained =
    !result.data && result.state === "loading" && last?.key === key && last.meter === binding?.meter
      ? last.view
      : null;
  if (failed)
    return (
      <div className="space-y-3">
        <p
          role="alert"
          className={`rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted ${usageMotion.enter}`}
        >
          {result.state === "forbidden"
            ? (labels?.forbidden ?? usageTableLabels.forbidden)
            : (labels?.failed ?? usageTableLabels.failed)}
        </p>
        {cursor && result.state === "unavailable" && (
          <Button variant="outline" size="sm" onClick={() => setPage(null)}>
            {labels?.first ?? usageTableLabels.first}
          </Button>
        )}
      </div>
    );
  return (
    <UsageTable
      view={result.data ?? retained}
      busy={retained !== null}
      labels={labels}
      sortable={sortable}
      dimensionSortValue={dimensionSortValue}
      hideMeasured={hideMeasured}
      dimensionLabels={dimensionLabels}
      unitLabels={unitLabels}
      formatFigure={formatFigure}
      formatUnit={formatUnit}
      formatDimension={formatDimension}
      showFunding={showFunding}
      formatFunding={formatFunding}
      metadata={metadata}
      details={details}
      onNextPage={setCursor}
      onFirstPage={cursor ? () => setPage(null) : undefined}
    />
  );
}
