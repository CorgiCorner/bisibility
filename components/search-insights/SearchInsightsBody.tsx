"use client";
import type { ExpandableCardView } from "@/components/ui/ExpandableCard";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
} from "@/lib/search-insights/queries/top-rows-model";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { type ModuleTablePaging, SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import {
  type RowsState,
  rowsReach,
  type SearchInsightsRowKind,
} from "./search-insights-rows-model";
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
/** The expanded card draws its controls a second time, so their ids and names take a suffix. */
function viewIdSuffix(view: ExpandableCardView) {
  return view === "expanded" ? "-expanded" : "";
}
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
  const t = useTranslations("projectSearchInsights");
  const rows = useSearchInsightsRows({ loadRowsAction, period, projectId, property, view });
  // A query added in this session is tracked before the server view says so, so the two sets are
  // read together rather than waiting for the refresh to land.
  const tracked =
    drawers.tracked.size === 0 ? rows.tracked : new Set([...rows.tracked, ...drawers.tracked]);
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
  // The window totals, not the search's: a search with no match still has a table to search.
  const hasQueries = view.queries.total > 0;
  const hasPages = view.pages.total > 0;
  const waitingReason = t("body.waitingForDays");
  const noTrafficReason = t("body.noTraffic");
  const queriesEmptyReason = !firstViewReady
    ? waitingReason
    : hasPages
      ? t("body.queriesWithheld")
      : noTrafficReason;
  const pagesEmptyReason = firstViewReady ? noTrafficReason : waitingReason;
  const manageGa4Link = (
    <a
      className="font-sans tabular-nums text-ui-caption text-fg-muted no-underline underline-offset-3 hover:text-fg hover:underline focus-visible:underline"
      href={`${appPath(asProjectRef(projectId), "integrations")}?connect=ga4`}
    >
      {t("copy.manageGa4")}
    </a>
  );
  const trafficMode = pagesLens === "traffic";
  const pagesCaption = (
    <span>
      {t("copy.pagesCaption")}
      {trafficMode && view.organicSessions.keyEventsConfigured === false ? (
        <> {t("copy.keyEventsNotConfigured")}</>
      ) : null}
    </span>
  );

  function rowsPaging<TRow>(
    kind: SearchInsightsRowKind,
    state: RowsState<TRow>,
    footerEnd?: ReactNode,
  ): ModuleTablePaging {
    const capNote =
      state.total > SEARCH_INSIGHTS_ROWS_CAP
        ? t("copy.showCapTitle", { count: SEARCH_INSIGHTS_ROWS_CAP })
        : null;
    return {
      emptyState: (
        <p className="m-0 px-4 py-8 text-center text-ui-body text-fg-muted">
          {t("copy.noRowsMatch", { search: state.search.trim() })}
        </p>
      ),
      footerStart:
        capNote || footerEnd ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {capNote ? <span>{capNote}</span> : null}
            {footerEnd}
          </span>
        ) : undefined,
      onChange: (next) => rows.paginate(kind, next),
      page: state.page,
      pageSize: state.pageSize,
      pending: rows.loading[kind],
      rowCount: rowsReach(state.total),
    };
  }

  function rowsSearch<TRow>(
    kind: SearchInsightsRowKind,
    state: RowsState<TRow>,
    label: string,
    view: ExpandableCardView,
  ) {
    return (
      <ToolbarSearch
        className="min-w-0 flex-1 sm:max-w-[320px]"
        id={`search-insights-${kind}-search${viewIdSuffix(view)}`}
        label={label}
        onChange={(value) => rows.search(kind, value)}
        placeholder={label}
        value={state.search}
      />
    );
  }

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
          caption={t("copy.queriesCaption")}
          empty={!hasQueries}
          emptyReason={queriesEmptyReason}
          title={t("copy.topQueries")}
          toolbar={(view) => rowsSearch("queries", rows.queries, t("copy.searchQueries"), view)}
        >
          {(view) => (
            <SearchInsightsQueriesTable
              bordered={false}
              adding={drawers.adding}
              onOpen={onOpenQuery ?? drawers.openQuery}
              onTrack={onTrack ?? drawers.track}
              paging={rowsPaging("queries", rows.queries)}
              rows={rows.queries.rows}
              sort={{
                onSort: (key) => rows.sortBy("queries", key),
                value: rows.queries.sort,
              }}
              tracked={tracked}
              view={view}
            />
          )}
        </SearchInsightsRowsCard>
        <SearchInsightsRowsCard
          caption={pagesCaption}
          empty={!hasPages}
          emptyReason={pagesEmptyReason}
          title={t("copy.topPages")}
          toolbar={(cardView) => (
            <>
              {rowsSearch("pages", rows.pages, t("copy.searchPages"), cardView)}
              {sessionsReadable ? (
                <div className="ms-auto shrink-0">
                  <SearchInsightsPagesLens
                    lens={pagesLens}
                    name={`search-insights-pages-lens${viewIdSuffix(cardView)}`}
                    showSessions={sessionsReadable}
                  />
                </div>
              ) : null}
            </>
          )}
        >
          {(cardView) => (
            <SearchInsightsPagesTable
              bordered={false}
              lens={pagesLens}
              onOpen={onOpenPage ?? drawers.openPage}
              paging={rowsPaging(
                "pages",
                rows.pages,
                trafficMode && sessionsConnected ? manageGa4Link : undefined,
              )}
              rows={rows.pages.rows}
              keyEventsConfigured={view.organicSessions.keyEventsConfigured}
              showSessions={sessionsReadable}
              sort={{ onSort: (key) => rows.sortBy("pages", key), value: rows.pages.sort }}
              view={cardView}
            />
          )}
        </SearchInsightsRowsCard>
      </div>
      {hasQueries && hasPages ? (
        <p className="m-0 max-w-content px-0.5 pt-1 text-ui-caption text-fg-muted">
          {t("copy.tablesFootnote")}
        </p>
      ) : null}
    </div>
  );
}
