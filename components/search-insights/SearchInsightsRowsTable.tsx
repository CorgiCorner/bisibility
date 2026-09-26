"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { ExpandableCardView } from "@/components/ui/ExpandableCard";
import { SEARCH_INSIGHTS_PAGE_SIZES } from "@/lib/search-insights/constants";
import type { SearchInsightsQueryRow } from "@/lib/search-insights/queries/top-rows-model";
import type {
  SearchInsightsSort,
  SearchInsightsSortKey,
} from "@/lib/search-insights/queries/top-rows-sort";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useMemo } from "react";
import {
  SEARCH_INSIGHTS_TABLE_DENSITY,
  SearchInsightsTableFrame,
  searchInsightsTableLayout,
} from "./SearchInsightsTableFrame";
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

/** Server pages for a module table. Without it the table shows the rows it is given. */
export type ModuleTablePaging = {
  emptyState?: ReactNode;
  footerStart?: ReactNode;
  onChange: (next: { page: number; pageSize: number }) => void;
  page: number;
  pageSize: number;
  pending?: boolean;
  rowCount: number;
};

export function searchInsightsPagingProps(paging?: ModuleTablePaging) {
  if (!paging) return {};
  return {
    emptyState: paging.emptyState,
    footerStart: paging.footerStart,
    onPaginationChange: paging.onChange,
    pagination: {
      page: paging.page,
      pageSize: paging.pageSize,
      pageSizeOptions: SEARCH_INSIGHTS_PAGE_SIZES,
      rowCount: paging.rowCount,
    },
    paginationMode: "server" as const,
    pending: paging.pending,
  };
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
  bordered?: boolean;
  onOpen?: (row: SearchInsightsQueryRow) => void;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  paging?: ModuleTablePaging;
  rows: readonly SearchInsightsQueryRow[];
  sort?: ModuleTableSort;
  tracked: ReadonlySet<string>;
  view?: ExpandableCardView;
};

export function SearchInsightsQueriesTable({
  adding = NO_ADDING,
  bordered = true,
  onOpen,
  onTrack,
  paging,
  rows,
  sort,
  tracked,
  view,
}: Readonly<SearchInsightsQueriesTableProps>) {
  const locale = useLocale();
  const t = useTranslations("projectSearchInsights.copy");
  const dataRows = useMemo<SearchInsightsQueryDataTableRow[]>(
    () => rows.map((row) => ({ ...row, id: row.query })),
    [rows],
  );
  const columns = useMemo(
    () =>
      searchInsightsQueryColumns({ adding, locale, onTrack, sortable: Boolean(sort), t, tracked }),
    [adding, locale, onTrack, sort, t, tracked],
  );
  return (
    <SearchInsightsTableFrame paged={Boolean(paging)} rows={dataRows.length} view={view}>
      <DataTable
        bordered={bordered}
        ariaLabel={t("topQueries")}
        columns={columns}
        density={SEARCH_INSIGHTS_TABLE_DENSITY}
        id="search-insights-queries"
        layout={searchInsightsTableLayout(view)}
        onRowClick={onOpen}
        onSortingChange={(next) => forwardSearchInsightsSort(sort, next)}
        rows={dataRows}
        {...searchInsightsPagingProps(paging)}
        sorting={searchInsightsDataTableSort(sort)}
        sortingMode="server"
      />
    </SearchInsightsTableFrame>
  );
}
