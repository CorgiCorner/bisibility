import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { DRAWER_LIST_ROWS } from "@/lib/search-insights/constants";
import type { DateWindow } from "@/lib/search-insights/dates";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { loadSearchInsightsScope } from "./context";
import {
  EMPTY_LIST,
  EMPTY_STATS,
  pageSlices,
  perDaySeries,
  type SearchInsightsDay,
  type SearchInsightsList,
  type SearchInsightsPageSlice,
  type SearchInsightsStats,
  statsOf,
} from "./detail-model";
import { organicSessionsPropertyForWindow } from "./sessions-context";
import { getLandingPageGa4Metrics } from "./top-rows";
import { getTrackedQueryTexts } from "./tracked";
import { trackedKey } from "./tracked-model";
import { searchInsightsWindowFilter } from "./window-filter";

export type SearchInsightsQueryDetail = {
  /** Whether the drawer's page rows can read a matching, fully covered GA4 window. */
  pageMetricsReadable: boolean;
  /** The pages Google chose for this query, with the slice of it each one carries. */
  pages: SearchInsightsList<SearchInsightsPageSlice>;
  /** The GA4 key-event configuration is a separate true, false, or unknown state. */
  keyEventsConfigured: boolean | null;
  perDay: readonly SearchInsightsDay[];
  query: string;
  stats: SearchInsightsStats;
  /** Whether Rank Tracker already checks this query, so the footer offers the right action. */
  tracked: boolean;
};

export const EMPTY_QUERY_DETAIL: SearchInsightsQueryDetail = {
  keyEventsConfigured: null,
  pageMetricsReadable: false,
  pages: EMPTY_LIST,
  perDay: [],
  query: "",
  stats: EMPTY_STATS,
  tracked: false,
};

type DayRow = {
  clicks: bigint;
  date: Date;
  impressions: bigint;
  positionWeight: number | null;
};

type PageRow = {
  clicks: bigint;
  page: string;
  position: number;
  total: bigint;
};

/**
 * One query, read from the stored daily rows only. The window totals fold the same day rows the
 * bars are drawn from, and the pivot reads the query-by-page table so each page carries its
 * position on THIS query rather than its average across everything.
 */
export async function getQueryDetail(
  projectId: string,
  property: string,
  window: DateWindow,
  query: string,
  sessionsProperty: string | null = null,
  keyEventsConfigured: boolean | null = null,
): Promise<SearchInsightsQueryDetail> {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  const [days, pages, tracked] = await Promise.all([
    prisma.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT
        "date",
        SUM("clicks") AS "clicks",
        SUM("impressions") AS "impressions",
        SUM("position" * "impressions") AS "positionWeight"
      FROM "search_analytics_query_daily"
      WHERE ${filter} AND "keyHash" = ${dimensionKeyHash([query])}
      GROUP BY "date"
      ORDER BY "date" ASC
    `),
    // The pivot's key hashes the (query, page) pair, so no single-dimension value can address it;
    // this side matches the text column until that table carries an index of its own.
    prisma.$queryRaw<PageRow[]>(Prisma.sql`
      SELECT
        "page",
        SUM("clicks") AS "clicks",
        SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0) AS "position",
        COUNT(*) OVER () AS "total"
      FROM "search_analytics_query_page_daily"
      WHERE ${filter} AND "query" = ${query}
      GROUP BY "page"
      ORDER BY SUM("clicks") DESC, "page" ASC
      LIMIT ${DRAWER_LIST_ROWS}
    `),
    getTrackedQueryTexts(projectId, [query]),
  ]);
  const metricsByPage = await getLandingPageGa4Metrics(
    projectId,
    sessionsProperty,
    window,
    pages.map((page) => page.page),
  );

  return {
    keyEventsConfigured,
    pageMetricsReadable: Boolean(sessionsProperty),
    pages: pageSlices(pages.map((page) => ({ ...page, ...metricsByPage.get(page.page) }))),
    perDay: perDaySeries(window, days),
    query,
    stats: statsOf(days),
    tracked: tracked.has(trackedKey(query)),
  };
}

/**
 * The drawer's own entry point. The property and the window come from the scope rather than the
 * caller, so a client can never read a period or a property it was not shown.
 */
export async function loadQueryDetail(
  projectRef: string,
  input: { comparison?: string; period?: string; property?: string; query: string },
): Promise<SearchInsightsQueryDetail> {
  const scope = await loadSearchInsightsScope(projectRef, {
    ...(input.comparison ? { comparison: input.comparison } : {}),
    period: input.period,
    property: input.property,
  });
  const finalized = scope.window;
  const window = finalized?.current ?? null;
  if (!scope.property || !finalized || !window) {
    return { ...EMPTY_QUERY_DETAIL, query: input.query };
  }
  const organicSessions = scope.organicSessions;
  const sessionsProperty = organicSessions
    ? organicSessionsPropertyForWindow(organicSessions, finalized)
    : null;
  return getQueryDetail(
    scope.projectId,
    scope.property,
    window,
    input.query,
    sessionsProperty,
    organicSessions?.keyEventsConfigured ?? null,
  );
}
