"use client";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
} from "@/lib/search-insights/queries/top-rows-model";
import type { ReactNode } from "react";
import { useSearchInsightsDrawerHandlers } from "./drawers/useDrawerHandlers";
import { SearchInsightsKpiRow } from "./SearchInsightsKpiRow";
import { SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { SearchInsightsRowsCard } from "./SearchInsightsRowsCard";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import { SearchInsightsSessionsCard } from "./SearchInsightsSessionsCard";
import { SearchInsightsSignalChips } from "./SearchInsightsSignalChips";
import {
  MANAGE_SESSIONS_LABEL,
  TABLE_CAPTIONS,
  TABLE_TITLES,
  TABLES_FOOTNOTE,
} from "./search-insights-copy";
import { visibleRows } from "./search-insights-rows-model";
import { organicSessionsPendingPresentation } from "./search-insights-sessions-model";
import { moduleTablesLayout } from "./search-insights-table-columns";
import { useSearchInsightsRows } from "./useSearchInsightsRows";
export type SearchInsightsBodyProps = {
  /** Slot for the optional second-source card under the two chips. */
  ga4Card?: ReactNode;
  importState: SearchInsightsImportState | null;
  loadRowsAction: LoadSearchInsightsRowsAction;
  onOpenBand?: () => void;
  onOpenOverlap?: () => void;
  onOpenPage?: (row: SearchInsightsPageRow) => void;
  onOpenQuery?: (row: SearchInsightsQueryRow) => void;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  period: string;
  projectId: string;
  property: string;
  view: SearchInsightsFirstView;
};
export function SearchInsightsBody({
  ga4Card,
  importState,
  loadRowsAction,
  onOpenBand,
  onOpenOverlap,
  onOpenPage,
  onOpenQuery,
  onTrack,
  period,
  projectId,
  property,
  view,
}: Readonly<SearchInsightsBodyProps>) {
  const drawers = useSearchInsightsDrawerHandlers();
  const rows = useSearchInsightsRows({ loadRowsAction, period, projectId, property, view });
  // A query added in this session is tracked before the server view says so, so the two sets are
  // read together rather than waiting for the refresh to land.
  const tracked =
    drawers.tracked.size === 0 ? rows.tracked : new Set([...rows.tracked, ...drawers.tracked]);
  const shownQueries = visibleRows(rows.queries.rows, rows.queries.show);
  const shownPages = visibleRows(rows.pages.rows, rows.pages.show);
  const sessionsConnected = view.organicSessions.status === "connected";
  const sessionsDisconnected = view.organicSessions.status === "not_connected";
  const pendingSessionsKpi =
    !sessionsDisconnected && view.sessionsKpi === null
      ? organicSessionsPendingPresentation(view.organicSessions, importState, period)
      : null;
  const sessionsReadable = view.sessionsReadable;
  const firstViewReady = importState?.facts?.readyThrough.d7.current === true;
  const hasQueries = rows.queries.total > 0;
  const hasPages = rows.pages.total > 0;
  const waitingReason =
    "Waiting for the first finalized days. Rows appear here after finalized days are imported.";
  const noTrafficReason = "Google reported no search traffic for this property in this window.";
  const queriesEmptyReason = !firstViewReady
    ? waitingReason
    : hasPages
      ? "Google named no queries in this window. The traffic in Top pages is real - its query text is withheld for privacy."
      : noTrafficReason;
  const pagesEmptyReason = firstViewReady ? noTrafficReason : waitingReason;
  const pagesCaption = sessionsConnected ? (
    <>
      {TABLE_CAPTIONS.pages} <span aria-hidden> / </span>{" "}
      <a
        className="font-sans tabular-nums text-ui-micro text-fg underline decoration-fg underline-offset-3"
        href={`${appPath(asProjectRef(projectId), "integrations")}?connect=ga4`}
      >
        {MANAGE_SESSIONS_LABEL}
      </a>
    </>
  ) : (
    TABLE_CAPTIONS.pages
  );

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <SearchInsightsKpiRow extra={view.sessionsKpi ?? pendingSessionsKpi} kpis={view.kpis} />
      <SearchInsightsSignalChips
        ga4Card={
          ga4Card ??
          (sessionsDisconnected ? <SearchInsightsSessionsCard projectId={projectId} /> : null)
        }
        onOpenBand={
          onOpenBand ?? (() => drawers.openList("band", view.signals.bandCount, view.queries.total))
        }
        onOpenOverlap={
          onOpenOverlap ??
          (() => drawers.openList("overlap", view.signals.overlapCount, view.queries.total))
        }
        signals={view.signals}
      />
      {/* Two tables sit side by side until a numeric column would start truncating; then they
          stack, each keeping its own horizontal scroll rather than shrinking a column. */}
      <div className={moduleTablesLayout}>
        <SearchInsightsRowsCard
          caption={TABLE_CAPTIONS.queries}
          emptyReason={queriesEmptyReason}
          loading={rows.loading.queries}
          onCollapse={() => rows.collapse("queries")}
          onMore={() => rows.expand("queries")}
          show={rows.queries.show}
          shown={shownQueries.length}
          title={TABLE_TITLES.queries}
          total={rows.queries.total}
        >
          <SearchInsightsQueriesTable
            adding={drawers.adding}
            onOpen={onOpenQuery ?? drawers.openQuery}
            onTrack={onTrack ?? drawers.track}
            rows={shownQueries}
            scroll={rows.queries.show === "all"}
            sort={{
              onSort: (key) => rows.sortBy("queries", key),
              value: rows.sort.queries,
            }}
            tracked={tracked}
          />
        </SearchInsightsRowsCard>
        <SearchInsightsRowsCard
          caption={pagesCaption}
          emptyReason={pagesEmptyReason}
          loading={rows.loading.pages}
          onCollapse={() => rows.collapse("pages")}
          onMore={() => rows.expand("pages")}
          show={rows.pages.show}
          shown={shownPages.length}
          title={TABLE_TITLES.pages}
          total={rows.pages.total}
        >
          <SearchInsightsPagesTable
            onOpen={onOpenPage ?? drawers.openPage}
            rows={shownPages}
            scroll={rows.pages.show === "all"}
            showSessions={sessionsReadable}
            sort={{ onSort: (key) => rows.sortBy("pages", key), value: rows.sort.pages }}
          />
        </SearchInsightsRowsCard>
      </div>
      {hasQueries && hasPages ? (
        <p className="m-0 max-w-content px-0.5 pt-1 text-ui-caption text-fg-muted">
          {TABLES_FOOTNOTE}
        </p>
      ) : null}
    </div>
  );
}
