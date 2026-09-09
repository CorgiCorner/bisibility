"use client";

import { KEY_EVENTS_NOT_CONFIGURED } from "@/components/search-insights/search-insights-copy";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { SearchInsightsBandRow } from "@/lib/search-insights/queries/band-list";
import type { SearchInsightsOverlapRow } from "@/lib/search-insights/queries/overlap-list";
import { drawerFrameKey } from "./drawer-model";
import {
  type DrawerBandDataTableRow,
  type DrawerOverlapDataTableRow,
  type DrawerRow,
  type DrawerSliceDataTableRow,
  drawerBandColumns,
  drawerOverlapColumns,
  drawerOverlapRows,
  drawerSliceColumns,
} from "./drawer-table-columns";

export type { DrawerRow } from "./drawer-table-columns";

const EMPTY_SORT = null;
const NOOP_SORT = () => {};

function drawerRowClassName(seen: ReadonlySet<string>) {
  return (row: { id: string }) => (seen.has(row.id) ? "!bg-bg-sunken" : undefined);
}

function queryRowClassName(seen: ReadonlySet<string>, query: string) {
  return seen.has(drawerFrameKey({ kind: "query", query })) ? "!bg-bg-sunken" : undefined;
}

export type DrawerSliceRowsProps = {
  keyEventsConfigured?: boolean | null;
  label: string;
  pageMetricsReadable?: boolean;
  rows: readonly DrawerRow[];
  seen: ReadonlySet<string>;
  textHeader: "Page" | "Query";
};

export function DrawerSliceRows({
  keyEventsConfigured = null,
  label,
  pageMetricsReadable = false,
  rows,
  seen,
  textHeader,
}: Readonly<DrawerSliceRowsProps>) {
  const showPageMetrics = textHeader === "Page" && pageMetricsReadable;
  const dataRows: DrawerSliceDataTableRow[] = rows.map((row) => ({ ...row, id: row.key }));
  return (
    <>
      {showPageMetrics && keyEventsConfigured === false ? (
        <p className="m-0 mb-2.25 text-ui-caption leading-normal text-fg-muted">
          {KEY_EVENTS_NOT_CONFIGURED}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-card">
        <DataTable
          ariaLabel={label}
          columns={drawerSliceColumns({ keyEventsConfigured, showPageMetrics, textHeader })}
          density="compact"
          id={`search-insights-drawer-slice-${textHeader.toLowerCase()}${showPageMetrics ? "-metrics" : ""}`}
          layout="auto"
          onRowClick={(row) => row.onOpen()}
          onSortingChange={NOOP_SORT}
          rowClassName={drawerRowClassName(seen)}
          rows={dataRows}
          sorting={EMPTY_SORT}
        />
      </div>
    </>
  );
}

export type DrawerBandRowsProps = {
  label: string;
  onOpen: (query: string) => void;
  rows: readonly SearchInsightsBandRow[];
  seen: ReadonlySet<string>;
};

export function DrawerBandRows({ label, onOpen, rows, seen }: Readonly<DrawerBandRowsProps>) {
  const dataRows: DrawerBandDataTableRow[] = rows.map((row) => ({ ...row, id: row.query }));
  return (
    <div className="overflow-hidden rounded-card">
      <DataTable
        ariaLabel={label}
        columns={drawerBandColumns}
        density="compact"
        id="search-insights-drawer-band"
        layout="auto"
        onRowClick={(row) => onOpen(row.query)}
        onSortingChange={NOOP_SORT}
        rowClassName={(row) => queryRowClassName(seen, row.query)}
        rows={dataRows}
        sorting={EMPTY_SORT}
      />
    </div>
  );
}

export type DrawerOverlapRowsProps = {
  label: string;
  onOpen: (query: string) => void;
  rows: readonly SearchInsightsOverlapRow[];
  seen: ReadonlySet<string>;
};

export function DrawerOverlapRows({ label, onOpen, rows, seen }: Readonly<DrawerOverlapRowsProps>) {
  const dataRows: DrawerOverlapDataTableRow[] = drawerOverlapRows(rows);
  return (
    <div className="overflow-hidden rounded-card [&>[role=table]>div>[role=rowgroup]:first-child]:hidden">
      <DataTable
        ariaLabel={label}
        columns={drawerOverlapColumns}
        defaultExpanded="all"
        density="compact"
        id="search-insights-drawer-overlap"
        layout="auto"
        onGroupRowClick={(row) => {
          if ("query" in row) onOpen(row.query);
        }}
        onSortingChange={NOOP_SORT}
        rowClassName={(row) => ("query" in row ? queryRowClassName(seen, row.query) : undefined)}
        rows={dataRows}
        sorting={EMPTY_SORT}
      />
    </div>
  );
}
