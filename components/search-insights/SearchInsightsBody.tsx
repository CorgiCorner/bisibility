"use client";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { addDays } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type { OrganicSessionsPendingPresentation } from "@/lib/search-insights/queries/sessions-context";
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
const MAX_READY_MINUTES = 24 * 60;
function readyInGa4Duration(importState: SearchInsightsImportState, period: string) {
  const periodDays = Number(period);
  if (
    !Number.isSafeInteger(periodDays) ||
    periodDays <= 0 ||
    !Number.isSafeInteger(importState.daysTotal)
  )
    return null;
  const comparedDays = Math.min(importState.daysTotal, periodDays * 2);
  const daysDone = Math.min(importState.daysTotal, Math.max(0, importState.daysDone));
  const daysRemaining = Math.max(0, comparedDays - daysDone);
  const startedAt = importState.lastSyncStartedAt ?? importState.createdAt;
  const elapsedMs =
    startedAt && importState.updatedAt
      ? Date.parse(importState.updatedAt) - Date.parse(startedAt)
      : NaN;
  if (daysDone <= 0 || daysRemaining <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 60_000)
    return null;
  const minutes = Math.ceil((daysRemaining * elapsedMs) / (daysDone * 60_000));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_READY_MINUTES) return null;
  return `~${minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} hr`}`;
}

function ga4IsOneDayBehind(
  gscFinalizedThroughDate: string | null,
  ga4FinalizedThroughDate: string | null,
) {
  if (!gscFinalizedThroughDate || !ga4FinalizedThroughDate) return false;
  try {
    return addDays(ga4FinalizedThroughDate, 1) === gscFinalizedThroughDate;
  } catch {
    return false;
  }
}

function organicSessionsPendingPresentation(
  organicSessions: SearchInsightsFirstView["organicSessions"],
  gscImportState: SearchInsightsImportState | null,
  period: string,
): OrganicSessionsPendingPresentation {
  const { importState } = organicSessions;
  if (organicSessions.status === "needs_reauth" || importState?.pausedReason === "needs_reauth")
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: "Reconnect GA4 before the import can continue.",
      source: "GA4",
      status: "Needs reauth",
    };
  if (!importState)
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: "The GA4 import is queued for worker pickup.",
      source: "GA4",
      status: "Queued",
    };
  if (importState.pausedReason === "user")
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: "The GA4 import is paused until you resume it.",
      source: "GA4",
      status: "Paused by you",
    };
  if (importState.pausedReason === "rate_limited")
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: "The GA4 provider limit will reset before the import resumes.",
      source: "GA4",
      status: "Paused by provider limits",
    };
  if (
    importState.state === "waiting_on_worker" ||
    importState.state === "waiting_for_worker" ||
    importState.state === "waiting_worker"
  )
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: "The GA4 import is waiting for a background worker.",
      source: "GA4",
      status: "Waiting on worker",
    };
  if (importState.state === "failed" || importState.pausedReason === "error")
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: "Retry the GA4 import to continue.",
      source: "GA4",
      status: "Needs retry",
    };
  if (importState.state === "completed") {
    const oneDayBehind = ga4IsOneDayBehind(
      gscImportState?.newestFinalizedDate ?? null,
      importState.finalizedThroughDate,
    );
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: oneDayBehind
        ? "GA4 has not finalized today's data yet."
        : "GA4 history does not cover this comparison yet.",
      source: "GA4",
      status: oneDayBehind ? "Waiting for today's GA4 data" : "Complete",
    };
  }
  if (importState.state === "queued")
    return {
      kind: "pending",
      label: "Organic sessions",
      readyIn: null,
      reason: "The GA4 import is queued for worker pickup.",
      source: "GA4",
      status: "Queued",
    };
  return {
    kind: "pending",
    label: "Organic sessions",
    readyIn: readyInGa4Duration(importState, period),
    reason: "Importing newest GA4 ranges.",
    source: "GA4",
    status: "Running",
  };
}

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
        className="font-mono text-ui-micro text-fg underline decoration-fg underline-offset-3"
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
