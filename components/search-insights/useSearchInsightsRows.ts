"use client";

import { useToast } from "@/components/ui";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import {
  FIRST_VIEW_ROWS,
  ROWS_PAGE_LIMIT,
  SEARCH_INSIGHTS_ROWS_CAP,
} from "@/lib/search-insights/constants";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
} from "@/lib/search-insights/queries/top-rows-model";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useState } from "react";
import { ROWS_FAILED } from "./search-insights-copy";
import {
  nextShow,
  type PageRowsState,
  type QueryRowsState,
  type RowsShow,
  rowsReach,
  type SearchInsightsRowKind,
} from "./search-insights-rows-model";

export type UseSearchInsightsRowsInput = {
  loadRowsAction: LoadSearchInsightsRowsAction;
  period: string;
  projectId: string;
  property: string;
  view: SearchInsightsFirstView;
};

type Loaded = {
  pages: readonly SearchInsightsPageRow[];
  queries: readonly SearchInsightsQueryRow[];
  total: number;
  tracked: readonly string[];
};

/** One spinner per table: each pages on its own, so neither request clears the other's. */
type RowsLoading = Record<SearchInsightsRowKind, boolean>;

const IDLE: RowsLoading = { pages: false, queries: false };

/** The rows on screen, and the server view they were read for. */
type RowsSnapshot = {
  pages: PageRowsState;
  queries: QueryRowsState;
  property: string;
  tracked: ReadonlySet<string>;
  view: SearchInsightsFirstView;
};

function seedRows(view: SearchInsightsFirstView, property: string): RowsSnapshot {
  return {
    pages: { rows: view.pages.rows, show: FIRST_VIEW_ROWS, total: view.pages.total },
    queries: { rows: view.queries.rows, show: FIRST_VIEW_ROWS, total: view.queries.total },
    property,
    tracked: new Set(view.trackedTexts),
    view,
  };
}

function withShow(
  current: RowsSnapshot,
  kind: SearchInsightsRowKind,
  show: RowsShow,
): RowsSnapshot {
  if (kind === "queries") return { ...current, queries: { ...current.queries, show } };
  return { ...current, pages: { ...current.pages, show } };
}

function withLoaded(
  current: RowsSnapshot,
  kind: SearchInsightsRowKind,
  show: RowsShow,
  loaded: Loaded,
): RowsSnapshot {
  if (kind === "queries") {
    return {
      ...current,
      queries: { rows: loaded.queries, show, total: loaded.total },
      tracked: new Set(loaded.tracked),
    };
  }
  return { ...current, pages: { rows: loaded.pages, show, total: loaded.total } };
}

/**
 * The tables hold what the first render loaded and ask for the rest only when the customer
 * asks for it. Every page comes from stored rows, so expanding costs nothing at the provider,
 * and the loop keeps going until it holds the window - or the cap, on a window too big for one
 * table, where the export takes over.
 */
export function useSearchInsightsRows({
  loadRowsAction,
  period,
  projectId,
  property,
  view,
}: UseSearchInsightsRowsInput) {
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState<RowsSnapshot>(() => seedRows(view, property));
  const [loading, setLoading] = useState<RowsLoading>(IDLE);

  // Another window or property arrives as a new view through a soft navigation, which keeps
  // this instance alive: the rows read for the previous one are dropped here, during render,
  // so the tables never describe a window the rest of the page has already left.
  const rows =
    snapshot.view === view && snapshot.property === property ? snapshot : seedRows(view, property);
  if (rows !== snapshot) {
    setSnapshot(rows);
    if (loading.pages || loading.queries) setLoading(IDLE);
  }

  async function fetchAll(kind: SearchInsightsRowKind, loaded: Loaded): Promise<Loaded> {
    const next = { ...loaded };
    // One request per page, and never more of them than the cap allows: a saturated window
    // would otherwise fire hundreds of full-window aggregations on a single click.
    let guard = Math.ceil(SEARCH_INSIGHTS_ROWS_CAP / ROWS_PAGE_LIMIT);
    while (next[kind].length < rowsReach(next.total) && guard > 0) {
      guard -= 1;
      const page = await loadRowsAction({
        kind,
        limit: Math.min(ROWS_PAGE_LIMIT, rowsReach(next.total) - next[kind].length),
        offset: next[kind].length,
        period,
        projectId,
        property,
      });
      // Only a page that carries rows describes the window on screen. An empty answer means
      // the scope moved on, and adopting its total would contradict the rows already shown.
      if (page.rows.length === 0) break;
      next.total = page.total;
      if (page.kind === "queries") {
        next.queries = [...next.queries, ...page.rows];
        next.tracked = [...next.tracked, ...page.trackedTexts];
      } else {
        next.pages = [...next.pages, ...page.rows];
      }
    }
    return next;
  }

  async function expand(kind: SearchInsightsRowKind) {
    const state = rows[kind];
    const requested = state.show;
    const show = nextShow(state.show);
    if (show !== "all") {
      setSnapshot(withShow(rows, kind, show));
      return;
    }

    setLoading((current) => ({ ...current, [kind]: true }));
    try {
      const loaded = await fetchAll(kind, {
        pages: rows.pages.rows,
        queries: rows.queries.rows,
        total: state.total,
        tracked: [...rows.tracked],
      });
      setSnapshot((current) => {
        // A window switch while the pages were in flight wins: those rows answer the old one.
        if (current.view !== view || current.property !== property) return current;
        // Collapsing while they were in flight wins too, but only over the expansion: the rows
        // are still this window's, so they are kept and the table stays at its ten.
        const settled = current[kind].show === requested ? show : current[kind].show;
        return withLoaded(current, kind, settled, loaded);
      });
    } catch (error) {
      showToast(actionErrorMessage(error, ROWS_FAILED), { severity: "error" });
    } finally {
      setLoading((current) => ({ ...current, [kind]: false }));
    }
  }

  function collapse(kind: SearchInsightsRowKind) {
    setSnapshot(withShow(rows, kind, FIRST_VIEW_ROWS));
  }

  return {
    collapse,
    expand: (kind: SearchInsightsRowKind) => void expand(kind),
    loading,
    pages: rows.pages,
    queries: rows.queries,
    tracked: rows.tracked,
  };
}
