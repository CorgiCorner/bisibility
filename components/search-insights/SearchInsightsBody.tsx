"use client";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
} from "@/lib/search-insights/queries/top-rows-model";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useSearchInsightsDrawerHandlers } from "./drawers/useDrawerHandlers";
import { SearchInsightsKpiRow } from "./SearchInsightsKpiRow";
import {
  PAGE_LENS_QUERY_PARAM,
  pageLensFromQuery,
  SearchInsightsPagesLens,
  SearchInsightsPagesTable,
} from "./SearchInsightsPagesTable";
import { SearchInsightsRowsCard } from "./SearchInsightsRowsCard";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import {
  KEY_EVENTS_NOT_CONFIGURED,
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
  importState: SearchInsightsImportState | null;
  loadRowsAction: LoadSearchInsightsRowsAction;
  onOpenPage?: (row: SearchInsightsPageRow) => void;
  onOpenQuery?: (row: SearchInsightsQueryRow) => void;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  period: string;
  projectId: string;
  property: string;
  signalChips: ReactNode;
  view: SearchInsightsFirstView;
};
export function SearchInsightsBody({
  importState,
  loadRowsAction,
  onOpenPage,
  onOpenQuery,
  onTrack,
  period,
  projectId,
  property,
  signalChips,
  view,
}: Readonly<SearchInsightsBodyProps>) {
  const drawers = useSearchInsightsDrawerHandlers();
  const searchParams = useSearchParams();
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
    !sessionsDisconnected && view.clicksToSessionsKpi === null
      ? organicSessionsPendingPresentation(view.organicSessions, importState, period)
      : null;
  const sessionsReadable = view.sessionsReadable;
  const pagesLens = pageLensFromQuery(
    searchParams.get(PAGE_LENS_QUERY_PARAM),
    sessionsReadable,
    view.organicSessions.keyEventsConfigured,
  );
  const firstViewReady = importState?.facts?.readyThrough.d1.current === true;
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
  const manageGa4Link = (
    <a
      className="font-sans tabular-nums text-ui-caption text-fg-muted no-underline underline-offset-3 hover:text-fg hover:underline focus-visible:underline"
      href={`${appPath(asProjectRef(projectId), "integrations")}?connect=ga4`}
    >
      {MANAGE_SESSIONS_LABEL}
    </a>
  );
  const trafficMode = pagesLens === "traffic";
  const pagesCaption = (
    <span>
      {TABLE_CAPTIONS.pages}
      {trafficMode && view.organicSessions.keyEventsConfigured === false ? (
        <> {KEY_EVENTS_NOT_CONFIGURED}</>
      ) : null}
    </span>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <SearchInsightsKpiRow
        extra={view.clicksToSessionsKpi ?? pendingSessionsKpi}
        kpis={view.kpis}
      />
      {signalChips}
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
          headerEnd={
            sessionsReadable ? (
              <SearchInsightsPagesLens lens={pagesLens} showSessions={sessionsReadable} />
            ) : undefined
          }
          footerEnd={trafficMode && sessionsConnected ? manageGa4Link : undefined}
          loading={rows.loading.pages}
          onCollapse={() => rows.collapse("pages")}
          onMore={() => rows.expand("pages")}
          show={rows.pages.show}
          shown={shownPages.length}
          title={TABLE_TITLES.pages}
          total={rows.pages.total}
        >
          <SearchInsightsPagesTable
            lens={pagesLens}
            onOpen={onOpenPage ?? drawers.openPage}
            rows={shownPages}
            scroll={rows.pages.show === "all"}
            keyEventsConfigured={view.organicSessions.keyEventsConfigured}
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
