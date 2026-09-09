"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { SearchInsightsPageRow } from "@/lib/search-insights/queries/top-rows-model";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";
import {
  forwardSearchInsightsSort,
  type ModuleTableSort,
  searchInsightsDataTableSort,
} from "./SearchInsightsRowsTable";
import {
  PAGE_LENS_CONTROL_LABEL,
  PAGE_LENS_SEARCH_LABEL,
  PAGE_LENS_TRAFFIC_LABEL,
} from "./search-insights-copy";
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
  showSessions: boolean;
};

export function SearchInsightsPagesLens({
  lens,
  showSessions,
}: Readonly<SearchInsightsPagesLensProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pick(nextLens: SearchInsightsPageLens) {
    if (nextLens === lens || pending) return;
    const next = new URLSearchParams(searchParams);
    next.set(PAGE_LENS_QUERY_PARAM, nextLens);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  if (!showSessions) return null;

  return (
    <SegmentedControl<SearchInsightsPageLens>
      ariaLabel={PAGE_LENS_CONTROL_LABEL}
      fitContent
      loading={pending}
      name="search-insights-pages-lens"
      onChange={pick}
      options={[
        { label: PAGE_LENS_SEARCH_LABEL, value: "search" },
        { label: PAGE_LENS_TRAFFIC_LABEL, value: "traffic" },
      ]}
      size="xs"
      value={lens}
    />
  );
}

export type SearchInsightsPagesTableProps = {
  keyEventsConfigured?: boolean | null;
  lens?: SearchInsightsPageLens;
  onOpen?: (row: SearchInsightsPageRow) => void;
  rows: readonly SearchInsightsPageRow[];
  scroll?: boolean;
  showSessions?: boolean;
  sort?: ModuleTableSort;
};

export function SearchInsightsPagesTable({
  keyEventsConfigured = null,
  lens,
  onOpen,
  rows,
  scroll = false,
  showSessions = false,
  sort,
}: Readonly<SearchInsightsPagesTableProps>) {
  const activeLens = pageLensFromQuery(lens, showSessions, keyEventsConfigured);
  const showTraffic = activeLens === "traffic";
  const dataRows = useMemo<SearchInsightsPageDataTableRow[]>(
    () => rows.map((row) => ({ ...row, id: row.url })),
    [rows],
  );
  const columns = useMemo(
    () => searchInsightsPageColumns({ keyEventsConfigured, showTraffic, sortable: Boolean(sort) }),
    [keyEventsConfigured, showTraffic, sort],
  );
  const table = (
    <DataTable
      ariaLabel="Top pages"
      columns={columns}
      density="compact"
      id="search-insights-pages"
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
