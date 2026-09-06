import "server-only";

import { type DeploymentMode, deploymentMode } from "@/lib/deployment/deployment";
import {
  type DataIncident,
  FIRST_VIEW_ROW_BUFFER,
  incidentsOverlapping,
} from "@/lib/search-insights/constants";
import type { FinalizedWindow } from "@/lib/search-insights/dates";
import { cache } from "react";
import { loadSearchInsightsScope, type ScopedOptions, type SearchInsightsScope } from "./context";
import { EMPTY_COVERAGE, getQueryCoverage, type SearchInsightsCoverage } from "./coverage";
import {
  EMPTY_WINDOW_SESSIONS,
  EMPTY_WINDOW_TOTALS,
  getOrganicSessionsTotals,
  getWindowTotals,
} from "./kpis";
import {
  type ClicksToSessionsKpi,
  clicksToSessionsKpi,
  type SearchInsightsKpi,
  searchInsightsKpis,
} from "./kpis-model";
import { type OrganicSessionsContext, organicSessionsPropertyForWindow } from "./sessions-context";
import { EMPTY_SIGNALS, getSearchInsightsSignals, type SearchInsightsSignals } from "./signals";
import { EMPTY_ROWS, getTopPages, getTopQueries } from "./top-rows";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
  SearchInsightsRows,
} from "./top-rows-model";
import type { SearchInsightsSort } from "./top-rows-sort";
import { getTrackedQueryTexts } from "./tracked";
import { readWindowFacts } from "./window-facts";

export type SearchInsightsFirstView = {
  coverage: SearchInsightsCoverage;
  clicksToSessionsKpi: ClicksToSessionsKpi | null;
  deploymentMode: DeploymentMode;
  /** Published provider anomalies overlapping the compared period, newest window included. */
  incidents: readonly DataIncident[];
  kpis: readonly SearchInsightsKpi[];
  organicSessions: OrganicSessionsContext;
  pages: SearchInsightsRows<SearchInsightsPageRow>;
  queries: SearchInsightsRows<SearchInsightsQueryRow>;
  sessionsKpi: SearchInsightsKpi | null;
  sessionsReadable: boolean;
  /** Normalized texts of the loaded queries the project already tracks. */
  trackedTexts: readonly string[];
};

const EMPTY_VIEW = {
  coverage: EMPTY_COVERAGE,
  clicksToSessionsKpi: null,
  incidents: [],
  kpis: searchInsightsKpis(EMPTY_WINDOW_TOTALS),
  pages: EMPTY_ROWS,
  queries: EMPTY_ROWS,
  sessionsKpi: null,
  sessionsReadable: false,
  trackedTexts: [],
} satisfies Omit<SearchInsightsFirstView, "deploymentMode" | "organicSessions">;

const NO_ORGANIC_SESSIONS: OrganicSessionsContext = {
  importState: null,
  keyEventsConfigured: null,
  property: null,
  status: "not_connected",
};

const PAGE = { limit: FIRST_VIEW_ROW_BUFFER, offset: 0 };

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

/**
 * The stored window facts, read once per request and shared by the view and the chips.
 *
 * A miss degrades to the live reads, which is the whole point: the import is the only writer, so
 * a window it has not reached yet, or one marked stale by a backfill filling a gap, still renders
 * correct numbers. It renders them slowly, and the miss is recorded.
 */
const requestWindowFacts = perRequestCache((scope: SearchInsightsScope) => {
  if (!scope.property || !scope.window) return Promise.resolve(null);
  return readWindowFacts({
    finalizedThrough: scope.window.current.end,
    projectId: scope.projectId,
    property: scope.property,
    windowDays: scope.period.days,
  }).then((read) => (read.kind === "hit" ? read.facts : null));
});

function previousWindowCovered(scope: SearchInsightsScope) {
  if (scope.period.id === "1") return false;
  if (scope.period.comparison === "year_over_year") return true;
  if (!scope.importFacts) return undefined;
  const readiness = {
    "7": scope.importFacts.readyThrough.d7,
    "28": scope.importFacts.readyThrough.d28,
    "90": scope.importFacts.readyThrough.d90,
  };
  return readiness[scope.period.id as "7" | "28" | "90"]?.previous;
}

function incidentsForComparedWindows({ current, previous }: FinalizedWindow) {
  const incidents = [
    ...incidentsOverlapping(previous.start, previous.end),
    ...incidentsOverlapping(current.start, current.end),
  ];
  return [...new Map(incidents.map((incident) => [incident.id, incident])).values()];
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

  const { current } = scope.window;
  const sessionsProperty = organicSessionsPropertyForWindow(
    organicSessions,
    scope.window,
    scope.period.id !== "1",
  );
  const facts = await requestWindowFacts(scope);
  const [totals, coverage, queries, pages, sessions] = await Promise.all([
    facts?.totals ?? getWindowTotals(scope.projectId, scope.property, scope.window),
    facts?.coverage ?? getQueryCoverage(scope.projectId, scope.property, current),
    // The stored lens holds a hundred rows under the default sort; the first view shows fifty.
    facts
      ? {
          rows: facts.defaultLensQueries.rows.slice(0, PAGE.limit),
          total: facts.defaultLensQueries.total,
        }
      : getTopQueries(scope.projectId, scope.property, current, PAGE),
    // Top pages stay live: 364 ms cold at the widest window, inside budget, so storing them
    // would buy a staleness surface for nothing.
    getTopPages(scope.projectId, scope.property, current, PAGE, sessionsProperty),
    sessionsProperty
      ? getOrganicSessionsTotals(scope.projectId, sessionsProperty, scope.window)
      : Promise.resolve(EMPTY_WINDOW_SESSIONS),
  ]);

  const tracked = await getTrackedQueryTexts(
    scope.projectId,
    queries.rows.map((row) => row.query),
  );
  const clicksToSessions = sessionsProperty
    ? clicksToSessionsKpi(totals, sessions, previousWindowCovered(scope))
    : null;

  return {
    coverage,
    clicksToSessionsKpi: clicksToSessions,
    deploymentMode: mode,
    incidents: incidentsForComparedWindows(scope.window),
    kpis: searchInsightsKpis(totals, previousWindowCovered(scope)),
    organicSessions,
    pages,
    queries,
    sessionsKpi: clicksToSessions?.kind === "visible" ? clicksToSessions.kpi : null,
    sessionsReadable: Boolean(sessionsProperty),
    trackedTexts: [...tracked],
  };
}

/**
 * The two signal counts share the page's authorized scope but resolve independently from the
 * first view. An empty result only represents a missing property or finalized window.
 */
export function getSearchInsightsFirstViewSignals(
  scope: SearchInsightsScope,
): Promise<SearchInsightsSignals> {
  if (!scope.property || !scope.window) return Promise.resolve(EMPTY_SIGNALS);
  const { current } = scope.window;
  return requestWindowFacts(scope).then(
    (facts) =>
      facts?.signals ??
      getSearchInsightsSignals(scope.projectId, scope.property as string, current),
  );
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
    sort?: SearchInsightsSort;
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

  const page = { limit: input.limit, offset: input.offset, sort: input.sort };
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
