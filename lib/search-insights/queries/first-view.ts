import "server-only";

import { type DeploymentMode, deploymentMode } from "@/lib/deployment/deployment";
import {
  type DataIncident,
  FIRST_VIEW_ROW_BUFFER,
  incidentsOverlapping,
} from "@/lib/search-insights/constants";
import { loadSearchInsightsScope, type ScopedOptions, type SearchInsightsScope } from "./context";
import { EMPTY_COVERAGE, getQueryCoverage, type SearchInsightsCoverage } from "./coverage";
import {
  EMPTY_WINDOW_SESSIONS,
  EMPTY_WINDOW_TOTALS,
  getOrganicSessionsTotals,
  getWindowTotals,
} from "./kpis";
import { organicSessionsKpi, type SearchInsightsKpi, searchInsightsKpis } from "./kpis-model";
import { type OrganicSessionsContext, organicSessionsPropertyForWindow } from "./sessions-context";
import { EMPTY_SIGNALS, getSearchInsightsSignals, type SearchInsightsSignals } from "./signals";
import { EMPTY_ROWS, getTopPages, getTopQueries } from "./top-rows";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
  SearchInsightsRows,
} from "./top-rows-model";
import { getTrackedQueryTexts } from "./tracked";

export type SearchInsightsFirstView = {
  coverage: SearchInsightsCoverage;
  deploymentMode: DeploymentMode;
  /** Published provider anomalies overlapping the compared period, newest window included. */
  incidents: readonly DataIncident[];
  kpis: readonly SearchInsightsKpi[];
  organicSessions: OrganicSessionsContext;
  pages: SearchInsightsRows<SearchInsightsPageRow>;
  queries: SearchInsightsRows<SearchInsightsQueryRow>;
  sessionsKpi: SearchInsightsKpi | null;
  sessionsReadable: boolean;
  signals: SearchInsightsSignals;
  /** Normalized texts of the loaded queries the project already tracks. */
  trackedTexts: readonly string[];
};

const EMPTY_VIEW = {
  coverage: EMPTY_COVERAGE,
  incidents: [],
  kpis: searchInsightsKpis(EMPTY_WINDOW_TOTALS),
  pages: EMPTY_ROWS,
  queries: EMPTY_ROWS,
  sessionsKpi: null,
  sessionsReadable: false,
  signals: EMPTY_SIGNALS,
  trackedTexts: [],
} satisfies Omit<SearchInsightsFirstView, "deploymentMode" | "organicSessions">;

const NO_ORGANIC_SESSIONS: OrganicSessionsContext = {
  importState: null,
  property: null,
  status: "not_connected",
};

const PAGE = { limit: FIRST_VIEW_ROW_BUFFER, offset: 0 };

function previousWindowCovered(scope: SearchInsightsScope) {
  if (!scope.importFacts) return undefined;
  const readiness = {
    "7": scope.importFacts.readyThrough.d7,
    "28": scope.importFacts.readyThrough.d28,
    "90": scope.importFacts.readyThrough.d90,
  };
  return readiness[scope.period.id as "7" | "28" | "90"]?.previous;
}

/**
 * Everything the first view renders, from stored rows only. Nothing here calls the provider:
 * the retention promise on the trust strip is only true if reading the module is free, and the
 * page must paint before the sixteen-month import has finished.
 *
 * The reads that do not depend on each other run together; the tracked lookup is the one that
 * does, because it asks about the query texts the first read returned.
 */
export async function getSearchInsightsFirstView(
  projectRef: string,
  options: ScopedOptions = {},
): Promise<SearchInsightsFirstView> {
  const scope = options.scope ?? (await loadSearchInsightsScope(projectRef, options));
  const mode = deploymentMode();
  const organicSessions = scope.organicSessions ?? NO_ORGANIC_SESSIONS;
  if (!scope.property || !scope.window) {
    return { ...EMPTY_VIEW, deploymentMode: mode, organicSessions };
  }

  const { current, previous } = scope.window;
  const sessionsProperty = organicSessionsPropertyForWindow(organicSessions, scope.window);
  const [totals, coverage, queries, pages, sessions, signals] = await Promise.all([
    getWindowTotals(scope.projectId, scope.property, scope.window),
    getQueryCoverage(scope.projectId, scope.property, current),
    getTopQueries(scope.projectId, scope.property, current, PAGE),
    getTopPages(scope.projectId, scope.property, current, PAGE, sessionsProperty),
    sessionsProperty
      ? getOrganicSessionsTotals(scope.projectId, sessionsProperty, scope.window)
      : Promise.resolve(EMPTY_WINDOW_SESSIONS),
    getSearchInsightsSignals(scope.projectId, scope.property, current),
  ]);

  const tracked = await getTrackedQueryTexts(
    scope.projectId,
    queries.rows.map((row) => row.query),
  );

  return {
    coverage,
    deploymentMode: mode,
    incidents: incidentsOverlapping(previous.start, current.end),
    kpis: searchInsightsKpis(totals, previousWindowCovered(scope)),
    organicSessions,
    pages,
    queries,
    sessionsKpi: sessionsProperty ? organicSessionsKpi(sessions) : null,
    sessionsReadable: Boolean(sessionsProperty),
    signals,
    trackedTexts: [...tracked],
  };
}

export type SearchInsightsRowKind = "pages" | "queries";

export type SearchInsightsRowsPage =
  | {
      kind: "queries";
      rows: readonly SearchInsightsQueryRow[];
      total: number;
      /** Normalized texts of these rows the project already tracks. */
      trackedTexts: readonly string[];
    }
  | { kind: "pages"; rows: readonly SearchInsightsPageRow[]; total: number };

/**
 * One page of stored rows for the tables' Show more and Show all controls. The requested
 * property is resolved through the authorized scope before stored rows are read.
 */
export async function getSearchInsightsRowsPage(
  projectRef: string,
  input: {
    kind: SearchInsightsRowKind;
    limit: number;
    offset: number;
    period?: string;
    property: string;
  },
): Promise<SearchInsightsRowsPage> {
  const scope = await loadSearchInsightsScope(projectRef, {
    period: input.period,
    property: input.property,
  });
  const organicSessions = scope.organicSessions ?? NO_ORGANIC_SESSIONS;
  const finalized = scope.window;
  const window = finalized?.current ?? null;
  if (!scope.property || !finalized || !window) {
    return input.kind === "pages"
      ? { kind: "pages", rows: [], total: 0 }
      : { kind: "queries", rows: [], total: 0, trackedTexts: [] };
  }

  const page = { limit: input.limit, offset: input.offset };
  if (input.kind === "pages") {
    const sessionsProperty = organicSessionsPropertyForWindow(organicSessions, finalized);
    const pages = await getTopPages(
      scope.projectId,
      scope.property,
      window,
      page,
      sessionsProperty,
    );
    return { kind: "pages", rows: pages.rows, total: pages.total };
  }

  const queries = await getTopQueries(scope.projectId, scope.property, window, page);
  const tracked = await getTrackedQueryTexts(
    scope.projectId,
    queries.rows.map((row) => row.query),
  );
  return { kind: "queries", rows: queries.rows, total: queries.total, trackedTexts: [...tracked] };
}
