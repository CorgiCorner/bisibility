"use client";

import { useToast } from "@/components/ui/toast-context";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { FIRST_VIEW_ROWS } from "@/lib/search-insights/constants";
import type {
  SearchInsightsFirstView,
  SearchInsightsRowsPage,
} from "@/lib/search-insights/queries/first-view";
import {
  SEARCH_INSIGHTS_DEFAULT_SORT,
  type SearchInsightsSortKey,
} from "@/lib/search-insights/queries/top-rows-sort";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  nextSort,
  type PageRowsState,
  type QueryRowsState,
  type RowsQuery,
  rowsOffset,
  rowsQuery,
  type SearchInsightsRowKind,
} from "./search-insights-rows-model";

export type UseSearchInsightsRowsInput = {
  loadRowsAction: LoadSearchInsightsRowsAction;
  period: string;
  projectId: string;
  property: string;
  view: SearchInsightsFirstView;
};

/** One spinner per table: each pages on its own, so neither request clears the other's. */
type RowsLoading = Record<SearchInsightsRowKind, boolean>;

const IDLE: RowsLoading = { pages: false, queries: false };

// Long enough that typing a word sends one request, short enough that the table keeps up.
const SEARCH_DEBOUNCE_MS = 300;

/** The page on screen for each table, and the server view it was read for. */
type RowsSnapshot = {
  pages: PageRowsState;
  queries: QueryRowsState;
  property: string;
  tracked: ReadonlySet<string>;
  view: SearchInsightsFirstView;
};

function seedRows(view: SearchInsightsFirstView, property: string): RowsSnapshot {
  const firstPage: RowsQuery = {
    page: 1,
    pageSize: FIRST_VIEW_ROWS,
    search: "",
    sort: SEARCH_INSIGHTS_DEFAULT_SORT,
  };
  return {
    pages: { ...firstPage, rows: view.pages.rows, total: view.pages.total },
    queries: { ...firstPage, rows: view.queries.rows, total: view.queries.total },
    property,
    tracked: new Set(view.trackedTexts),
    view,
  };
}

function withQuery(
  current: RowsSnapshot,
  kind: SearchInsightsRowKind,
  query: RowsQuery,
): RowsSnapshot {
  if (kind === "queries") return { ...current, queries: { ...current.queries, ...query } };
  return { ...current, pages: { ...current.pages, ...query } };
}

function withPage(current: RowsSnapshot, page: SearchInsightsRowsPage): RowsSnapshot {
  if (page.kind === "queries") {
    return {
      ...current,
      queries: { ...current.queries, rows: page.rows, total: page.total },
      tracked: new Set(page.trackedTexts),
    };
  }
  return { ...current, pages: { ...current.pages, rows: page.rows, total: page.total } };
}

/**
 * The tables open on the page the first render loaded and read every other page from the server.
 * A page, a page size, an order and a search are one request each: the rows come from stored
 * data, so paging costs nothing at the provider, and the browser only holds the page on screen.
 */
export function useSearchInsightsRows({
  loadRowsAction,
  period,
  projectId,
  property,
  view,
}: UseSearchInsightsRowsInput) {
  const { showToast } = useToast();
  const t = useTranslations("projectSearchInsights.copy");
  const [snapshot, setSnapshot] = useState<RowsSnapshot>(() => seedRows(view, property));
  const [loading, setLoading] = useState<RowsLoading>(IDLE);
  // A newer read owns its table: an old page cannot replace a newer one or clear its spinner.
  const latestRequest = useRef<Record<SearchInsightsRowKind, number>>({ pages: 0, queries: 0 });
  const searchTimers = useRef<Partial<Record<SearchInsightsRowKind, number>>>({});

  function beginRequest(kind: SearchInsightsRowKind) {
    latestRequest.current[kind] += 1;
    return latestRequest.current[kind];
  }

  function isLatestRequest(kind: SearchInsightsRowKind, revision: number) {
    return latestRequest.current[kind] === revision;
  }

  // Another window or property arrives as a new view through a soft navigation, which keeps
  // this instance alive: the pages read for the previous one are dropped here, during render,
  // so the tables never describe a window the rest of the page has already left.
  const rows =
    snapshot.view === view && snapshot.property === property ? snapshot : seedRows(view, property);
  if (rows !== snapshot) {
    setSnapshot(rows);
    if (loading.pages || loading.queries) setLoading(IDLE);
  }

  /**
   * Reads one page. The query is already on screen, so the header, the search box and the footer
   * show what was asked while the rows still show the last answer. A failed read puts the last
   * answered page, size and order back and keeps the typed search.
   */
  async function load(kind: SearchInsightsRowKind, query: RowsQuery, previous: RowsQuery) {
    const revision = beginRequest(kind);
    setLoading((current) => ({ ...current, [kind]: true }));
    try {
      const page = await loadRowsAction({
        kind,
        limit: query.pageSize,
        offset: rowsOffset(query),
        period,
        projectId,
        property,
        search: query.search.trim() || undefined,
        sort: query.sort,
      });
      setSnapshot((current) => {
        if (!isLatestRequest(kind, revision)) return current;
        // A window switch while the page was in flight wins: that page answers the old one.
        if (current.view !== view || current.property !== property) return current;
        return withPage(current, page);
      });
    } catch (error) {
      if (!isLatestRequest(kind, revision)) return;
      setSnapshot((current) =>
        current.view === view && current.property === property
          ? withQuery(current, kind, { ...previous, search: current[kind].search })
          : current,
      );
      showToast(actionErrorMessage(error, t("rowsFailed")), { severity: "error" });
    } finally {
      setLoading((current) =>
        isLatestRequest(kind, revision) ? { ...current, [kind]: false } : current,
      );
    }
  }

  function request(kind: SearchInsightsRowKind, patch: Partial<RowsQuery>) {
    // A page change while a search is still waiting sends the search with it, once.
    window.clearTimeout(searchTimers.current[kind]);
    const previous = rowsQuery(rows[kind]);
    const query = { ...previous, ...patch };
    setSnapshot((current) => withQuery(current, kind, query));
    void load(kind, query, previous);
  }

  /** A new order or page size starts again from the first page: the old offsets mean nothing. */
  function sortBy(kind: SearchInsightsRowKind, key: SearchInsightsSortKey) {
    request(kind, { page: 1, sort: nextSort(rows[kind].sort, key) });
  }

  function paginate(kind: SearchInsightsRowKind, next: { page: number; pageSize: number }) {
    request(kind, { ...next, page: next.pageSize === rows[kind].pageSize ? next.page : 1 });
  }

  /** The box follows every key; the read waits until the typing stops. */
  function search(kind: SearchInsightsRowKind, value: string) {
    window.clearTimeout(searchTimers.current[kind]);
    const previous = rowsQuery(rows[kind]);
    const query = { ...previous, page: 1, search: value };
    setSnapshot((current) => withQuery(current, kind, query));
    searchTimers.current[kind] = window.setTimeout(
      () => void load(kind, query, previous),
      SEARCH_DEBOUNCE_MS,
    );
  }

  return {
    loading,
    pages: rows.pages,
    paginate,
    queries: rows.queries,
    search,
    sortBy,
    tracked: rows.tracked,
  };
}
