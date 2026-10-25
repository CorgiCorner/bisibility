"use client";

import type { IndexingData, IndexingFilters, LoadUrlsAction } from "@/lib/search-index/ui-model";
import { useCallback, useRef, useState, useTransition } from "react";

export function useIndexingUrls(
  data: IndexingData | null,
  projectId: string,
  action: LoadUrlsAction,
) {
  const [filters, setFilters] = useState<IndexingFilters>({});
  const currentFilters = useRef(filters);
  const [rows, setRows] = useState(data?.urls ?? []);
  const [cursor, setCursor] = useState(data?.nextCursor ?? null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const sequence = useRef(0);
  const pages = useRef(1);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attach = useCallback(
    () => () => {
      clearTimeout(timeout.current);
      sequence.current += 1;
    },
    [],
  );
  const load = (query: IndexingFilters, next?: string, pageCount = 1) => {
    clearTimeout(timeout.current);
    const request = ++sequence.current;
    setError(false);
    startTransition(async () => {
      try {
        const result = await action({
          projectId,
          query: { ...query, history: "true", ...(next ? { cursor: next } : {}) },
        });
        let loaded = result.data;
        let after = result.meta.next_cursor;
        let loadedPages = 1;
        // Refresh the pages already opened after an inspection, retaining the full filter.
        while (!next && after && loadedPages < pageCount && request === sequence.current) {
          const page = await action({
            projectId,
            query: { ...query, history: "true", cursor: after },
          });
          loaded = [...loaded, ...page.data];
          after = page.meta.next_cursor;
          loadedPages += 1;
        }
        if (request !== sequence.current) return;
        setRows((previous) => (next ? [...previous, ...loaded] : loaded));
        setCursor(after);
        pages.current = next ? pages.current + 1 : loadedPages;
      } catch {
        if (request === sequence.current) setError(true);
      }
    });
  };
  const change = (patch: Partial<IndexingFilters>, debounce = false) => {
    const next = { ...currentFilters.current, ...patch };
    currentFilters.current = next;
    setFilters(next);
    clearTimeout(timeout.current);
    sequence.current += 1;
    if (debounce) timeout.current = setTimeout(() => load(next), 300);
    else load(next);
  };
  return {
    filters,
    rows,
    cursor,
    error,
    pending,
    attach,
    change,
    submitSearch: () => load(currentFilters.current),
    refresh: () => load(currentFilters.current, undefined, pages.current),
    more: () => cursor && load(currentFilters.current, cursor),
  };
}

export type IndexingUrlList = ReturnType<typeof useIndexingUrls>;
