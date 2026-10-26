"use client";

import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { IndexingData, IndexingFilters, LoadUrlsAction } from "@/lib/search-index/ui-model";
import { useCallback, useRef, useState, useTransition } from "react";

type Page = { page: number; pageSize: number };
const initialPage = { page: 1, pageSize: 50 };
const initialSort = { field: "url", direction: "asc" } as const;

export function useIndexingUrls(
  data: IndexingData | null,
  projectId: string,
  action: LoadUrlsAction,
) {
  const [filters, setFilters] = useState<IndexingFilters>({});
  const [page, setPage] = useState<Page>(initialPage);
  const [sorting, setSorting] = useState<DataTableSort>(initialSort);
  const current = useRef({ filters, page, sorting });
  const [rows, setRows] = useState(data?.urls ?? []);
  const [total, setTotal] = useState(data?.totalUrls ?? data?.report.total ?? 0);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const sequence = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attach = useCallback(
    () => () => {
      clearTimeout(timeout.current);
      sequence.current += 1;
    },
    [],
  );
  function load(state = current.current) {
    clearTimeout(timeout.current);
    const request = ++sequence.current;
    setError(false);
    startTransition(async () => {
      try {
        const result = await action({
          projectId,
          query: {
            ...state.filters,
            history: "true",
            page: state.page.page,
            limit: state.page.pageSize,
            sort_by: state.sorting.field as "url" | "state" | "crawl" | "change",
            sort_direction: state.sorting.direction,
          },
        });
        if (request !== sequence.current) return;
        setRows(result.data);
        setTotal(
          result.meta.total ?? (state.page.page - 1) * state.page.pageSize + result.data.length,
        );
        if (result.meta.page && result.meta.page !== state.page.page) {
          const next = { ...state.page, page: result.meta.page };
          current.current = { ...state, page: next };
          setPage(next);
        }
      } catch {
        if (request === sequence.current) setError(true);
      }
    });
  }
  function change(patch: Partial<IndexingFilters>, debounce = false) {
    const next = {
      ...current.current,
      filters: { ...current.current.filters, ...patch },
      page: { ...current.current.page, page: 1 },
    };
    current.current = next;
    setFilters(next.filters);
    setPage(next.page);
    clearTimeout(timeout.current);
    sequence.current += 1;
    if (debounce) timeout.current = setTimeout(() => load(next), 300);
    else load(next);
  }
  function changePage(next: Page) {
    current.current = { ...current.current, page: next };
    setPage(next);
    load();
  }
  function changeSort(next: DataTableSort | null) {
    if (next && !["url", "state", "crawl", "change"].includes(next.field)) return;
    const sort = next ?? initialSort;
    current.current = {
      ...current.current,
      sorting: sort,
      page: { ...current.current.page, page: 1 },
    };
    setSorting(sort);
    setPage(current.current.page);
    load();
  }
  return {
    filters,
    rows,
    error,
    pending,
    attach,
    change,
    sorting,
    pagination: { ...page, rowCount: total, pageSizeOptions: [25, 50, 100] },
    changePage,
    changeSort,
    submitSearch: () => load(),
    refresh: () => load(),
  };
}
export type IndexingUrlList = ReturnType<typeof useIndexingUrls>;
