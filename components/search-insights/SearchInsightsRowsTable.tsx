"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { SearchInsightsQueryRow } from "@/lib/search-insights/queries/top-rows-model";
import type {
  SearchInsightsSort,
  SearchInsightsSortKey,
} from "@/lib/search-insights/queries/top-rows-sort";
import { useMemo } from "react";
import {
  type SearchInsightsQueryDataTableRow,
  searchInsightsQueryColumns,
} from "./search-insights-data-table-columns";

const NO_ADDING: ReadonlySet<string> = new Set();

export type ModuleTableSort = {
  onSort: (key: SearchInsightsSortKey) => void;
  value: SearchInsightsSort;
};

export function searchInsightsDataTableSort(sort?: ModuleTableSort): DataTableSort | null {
  return sort ? { direction: sort.value.direction, field: sort.value.key } : null;
}

export function forwardSearchInsightsSort(
  sort: ModuleTableSort | undefined,
  next: DataTableSort | null,
) {
  if (!sort) return;
  sort.onSort((next?.field ?? sort.value.key) as SearchInsightsSortKey);
}

export type SearchInsightsQueriesTableProps = {
  adding?: ReadonlySet<string>;
  onOpen?: (row: SearchInsightsQueryRow) => void;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  rows: readonly SearchInsightsQueryRow[];
  scroll?: boolean;
  sort?: ModuleTableSort;
  tracked: ReadonlySet<string>;
};

export function SearchInsightsQueriesTable({
  adding = NO_ADDING,
  onOpen,
  onTrack,
  rows,
  scroll = false,
  sort,
  tracked,
}: Readonly<SearchInsightsQueriesTableProps>) {
  const dataRows = useMemo<SearchInsightsQueryDataTableRow[]>(
    () => rows.map((row) => ({ ...row, id: row.query })),
    [rows],
  );
  const columns = useMemo(
    () => searchInsightsQueryColumns({ adding, onTrack, sortable: Boolean(sort), tracked }),
    [adding, onTrack, sort, tracked],
  );
  const table = (
    <DataTable
      ariaLabel="Top queries"
      columns={columns}
      density="compact"
      id="search-insights-queries"
      layout={scroll ? "fill" : "auto"}
      onRowClick={onOpen}
      onSortingChange={(next) => forwardSearchInsightsSort(sort, next)}
      rows={dataRows}
      sorting={searchInsightsDataTableSort(sort)}
      sortingMode="server"
    />
  );

  return scroll ? <div className="h-130">{table}</div> : table;
}
