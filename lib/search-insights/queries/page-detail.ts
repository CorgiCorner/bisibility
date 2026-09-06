import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { DRAWER_LIST_ROWS } from "@/lib/search-insights/constants";
import type { DateWindow } from "@/lib/search-insights/dates";
import { normalizeLandingPath } from "@/lib/search-insights/join";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { loadSearchInsightsScope } from "./context";
import {
  EMPTY_LIST,
  EMPTY_STATS,
  perDaySeries,
  querySlices,
  type SearchInsightsDay,
  type SearchInsightsList,
  type SearchInsightsQuerySlice,
  type SearchInsightsStats,
  statsOf,
} from "./detail-model";
import { organicSessionsPropertyForWindow } from "./sessions-context";
import { sessionsWindowFilter } from "./sessions-filter";
import { pagePath } from "./top-rows-model";
import { searchInsightsWindowFilter } from "./window-filter";

export type SearchInsightsPageDetail = {
  engagementRate: number | null;
  keyEvents: number | null;
  path: string;
  perDay: readonly SearchInsightsDay[];
  /** The queries that landed here, with the slice of the page's clicks each one carried. */
  queries: SearchInsightsList<SearchInsightsQuerySlice>;
  /** Organic sessions for this landing page, or nothing when no second source is joined. */
  sessions: number | null;
  stats: SearchInsightsStats;
  url: string;
};

export const EMPTY_PAGE_DETAIL: SearchInsightsPageDetail = {
  engagementRate: null,
  keyEvents: null,
  path: "",
  perDay: [],
  queries: EMPTY_LIST,
  sessions: null,
  stats: EMPTY_STATS,
  url: "",
};

type DayRow = {
  clicks: bigint;
  date: Date;
  impressions: bigint;
  positionWeight: number | null;
};

type QueryRow = {
  clicks: bigint;
  position: number;
  query: string;
  total: bigint;
};

/**
 * One page, read from the stored daily rows only. The pivot is the query-by-page table, so each
 * query row is the slice of this page's clicks that query produced, not the query's own total.
 */
export async function getPageDetail(
  projectId: string,
  property: string,
  window: DateWindow,
  page: string,
  sessionsProperty: string | null = null,
): Promise<SearchInsightsPageDetail> {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  const [days, queries, sessions] = await Promise.all([
    prisma.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT
        "date",
        SUM("clicks") AS "clicks",
        SUM("impressions") AS "impressions",
        SUM("position" * "impressions") AS "positionWeight"
      FROM "search_analytics_page_daily"
      WHERE ${filter} AND "keyHash" = ${dimensionKeyHash([page])}
      GROUP BY "date"
      ORDER BY "date" ASC
    `),
    // The pivot's key hashes the (query, page) pair, so no single-dimension value can address it;
    // this side matches the text column until that table carries an index of its own.
    prisma.$queryRaw<QueryRow[]>(Prisma.sql`
      SELECT
        "query",
        SUM("clicks") AS "clicks",
        SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0) AS "position",
        COUNT(*) OVER () AS "total"
      FROM "search_analytics_query_page_daily"
      WHERE ${filter} AND "page" = ${page}
      GROUP BY "query"
      ORDER BY SUM("clicks") DESC, "query" ASC
      LIMIT ${DRAWER_LIST_ROWS}
    `),
    sessionsProperty
      ? prisma.$queryRaw<
          Array<{
            engagedSessions: bigint | number | null;
            keyEvents: bigint | number | null;
            sessions: bigint | number | null;
          }>
        >(Prisma.sql`
          SELECT
            SUM("sessions") AS "sessions",
            CASE WHEN bool_or("engagedSessions" IS NULL) THEN NULL ELSE SUM("engagedSessions") END AS "engagedSessions",
            CASE WHEN bool_or("keyEvents" IS NULL) THEN NULL ELSE SUM("keyEvents") END AS "keyEvents"
          FROM "organic_sessions_page_daily"
          WHERE ${sessionsWindowFilter(projectId, sessionsProperty, window)}
            AND "keyHash" = ${dimensionKeyHash([normalizeLandingPath(page)])}
        `)
      : Promise.resolve([]),
  ]);
  const sessionMetrics = sessions[0];
  const sessionCount =
    sessionsProperty && sessionMetrics?.sessions != null ? Number(sessionMetrics.sessions) : null;
  const engagedSessions =
    sessionsProperty && sessionMetrics?.engagedSessions != null
      ? Number(sessionMetrics.engagedSessions)
      : null;

  return {
    engagementRate:
      sessionCount === null || sessionCount === 0 || engagedSessions === null
        ? null
        : engagedSessions / sessionCount,
    keyEvents:
      sessionsProperty && sessionMetrics?.keyEvents != null
        ? Number(sessionMetrics.keyEvents)
        : null,
    path: pagePath(page),
    perDay: perDaySeries(window, days),
    queries: querySlices(queries),
    sessions: sessionCount,
    stats: statsOf(days),
    url: page,
  };
}

export async function loadPageDetail(
  projectRef: string,
  input: { comparison?: string; page: string; period?: string; property?: string },
): Promise<SearchInsightsPageDetail> {
  const scope = await loadSearchInsightsScope(projectRef, {
    ...(input.comparison ? { comparison: input.comparison } : {}),
    period: input.period,
    property: input.property,
  });
  const finalized = scope.window;
  const window = finalized?.current ?? null;
  if (!scope.property || !finalized || !window) {
    return { ...EMPTY_PAGE_DETAIL, path: pagePath(input.page), url: input.page };
  }
  return getPageDetail(
    scope.projectId,
    scope.property,
    window,
    input.page,
    organicSessionsPropertyForWindow(scope.organicSessions, finalized),
  );
}
