"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { SearchInsightsBandRow } from "@/lib/search-insights/queries/band-list";
import type { SearchInsightsOverlapRow } from "@/lib/search-insights/queries/overlap-list";
import { useLocale, useTranslations } from "next-intl";
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
  isPageRows: boolean;
  label: string;
  pageMetricsReadable?: boolean;
  rows: readonly DrawerRow[];
  seen: ReadonlySet<string>;
  textHeader: string;
};

export function DrawerSliceRows({
  keyEventsConfigured = null,
  isPageRows,
  label,
  pageMetricsReadable = false,
  rows,
  seen,
  textHeader,
}: Readonly<DrawerSliceRowsProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const locale = useLocale();
  const showPageMetrics = isPageRows && pageMetricsReadable;
  const dataRows: DrawerSliceDataTableRow[] = rows.map((row) => ({ ...row, id: row.key }));
  return (
    <>
      {showPageMetrics && keyEventsConfigured === false ? (
        <p className="m-0 mb-2.25 text-ui-caption leading-normal text-fg-muted">
          {t("keyEventsNotConfigured")}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-card">
        <DataTable
          ariaLabel={label}
          columns={drawerSliceColumns({
            keyEventsConfigured,
            locale,
            showPageMetrics,
            textHeader,
            t,
          })}
          density="compact"
          id={`search-insights-drawer-slice-${isPageRows ? "page" : "query"}${showPageMetrics ? "-metrics" : ""}`}
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
  const locale = useLocale();
  const t = useTranslations("projectSearchInsights.copy");
  const dataRows: DrawerBandDataTableRow[] = rows.map((row) => ({ ...row, id: row.query }));
  return (
    <div className="overflow-hidden rounded-card">
      <DataTable
        ariaLabel={label}
        columns={drawerBandColumns({ locale, t })}
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
  const locale = useLocale();
  const t = useTranslations("projectSearchInsights.copy");
  const dataRows: DrawerOverlapDataTableRow[] = drawerOverlapRows(rows);
  return (
    <div className="overflow-hidden rounded-card [&>[role=table]>div>[role=rowgroup]:first-child]:hidden">
      <DataTable
        ariaLabel={label}
        columns={drawerOverlapColumns({ locale, t })}
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
