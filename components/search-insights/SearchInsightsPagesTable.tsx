"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { ExpandableCardView } from "@/components/ui/ExpandableCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { SearchInsightsPageRow } from "@/lib/search-insights/queries/top-rows-model";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  forwardSearchInsightsSort,
  type ModuleTablePaging,
  type ModuleTableSort,
  searchInsightsDataTableSort,
  searchInsightsPagingProps,
} from "./SearchInsightsRowsTable";
import {
  SEARCH_INSIGHTS_TABLE_DENSITY,
  SearchInsightsTableFrame,
  searchInsightsTableLayout,
} from "./SearchInsightsTableFrame";
import {
  type SearchInsightsPageDataTableRow,
  searchInsightsPageColumns,
} from "./search-insights-pages-columns";

export const PAGE_LENS_QUERY_PARAM = "lens";

export type SearchInsightsPageLens = "search" | "traffic";

export function pageLensFromQuery(
  lens: string | null | undefined,
  ga4Joined: boolean,
  keyEventsConfigured: boolean | null,
): SearchInsightsPageLens {
  if (!ga4Joined) return "search";
  if (lens === "search" || lens === "traffic") return lens;
  return keyEventsConfigured === true ? "traffic" : "search";
}

export type SearchInsightsPagesLensProps = {
  lens: SearchInsightsPageLens;
  /** The radio group name; a second copy of the lens on the page needs its own. */
  name?: string;
  showSessions: boolean;
};

export function SearchInsightsPagesLens({
  lens,
  name = "search-insights-pages-lens",
  showSessions,
}: Readonly<SearchInsightsPagesLensProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The lens only changes columns the page already holds. A router navigation would re-render the
  // server view and reset both tables' search, sort and page, so only the URL is replaced.
  function pick(nextLens: SearchInsightsPageLens) {
    if (nextLens === lens) return;
    const next = new URLSearchParams(searchParams);
    next.set(PAGE_LENS_QUERY_PARAM, nextLens);
    window.history.replaceState(window.history.state, "", `${pathname}?${next.toString()}`);
  }

  if (!showSessions) return null;

  return (
    <SegmentedControl<SearchInsightsPageLens>
      ariaLabel={t("pageLensControl")}
      fitContent
      name={name}
      onChange={pick}
      options={[
        { label: t("pageLensSearch"), value: "search" },
        { label: t("pageLensTraffic"), value: "traffic" },
      ]}
      size="toolbar"
      value={lens}
    />
  );
}

export type SearchInsightsPagesTableProps = {
  bordered?: boolean;
  keyEventsConfigured?: boolean | null;
  lens?: SearchInsightsPageLens;
  onOpen?: (row: SearchInsightsPageRow) => void;
  paging?: ModuleTablePaging;
  rows: readonly SearchInsightsPageRow[];
  showSessions?: boolean;
  sort?: ModuleTableSort;
  view?: ExpandableCardView;
};

export function SearchInsightsPagesTable({
  bordered = true,
  keyEventsConfigured = null,
  lens,
  onOpen,
  paging,
  rows,
  showSessions = false,
  sort,
  view,
}: Readonly<SearchInsightsPagesTableProps>) {
  const locale = useLocale();
  const t = useTranslations("projectSearchInsights.copy");
  const activeLens = pageLensFromQuery(lens, showSessions, keyEventsConfigured);
  const showTraffic = activeLens === "traffic";
  const dataRows = useMemo<SearchInsightsPageDataTableRow[]>(
    () => rows.map((row) => ({ ...row, id: row.url })),
    [rows],
  );
  const columns = useMemo(
    () =>
      searchInsightsPageColumns({
        keyEventsConfigured,
        locale,
        showTraffic,
        sortable: Boolean(sort),
        t,
      }),
    [keyEventsConfigured, locale, showTraffic, sort, t],
  );
  return (
    <SearchInsightsTableFrame paged={Boolean(paging)} rows={dataRows.length} view={view}>
      <DataTable
        bordered={bordered}
        ariaLabel={t("topPages")}
        columns={columns}
        density={SEARCH_INSIGHTS_TABLE_DENSITY}
        id="search-insights-pages"
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
