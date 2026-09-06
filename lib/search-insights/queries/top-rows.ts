import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { ROWS_PAGE_LIMIT } from "@/lib/search-insights/constants";
import type { DateWindow } from "@/lib/search-insights/dates";
import { normalizeLandingPath } from "@/lib/search-insights/join";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { sessionsWindowFilter } from "./sessions-filter";
import {
  type AggregatedRow,
  pageRows,
  queryRows,
  type SearchInsightsPageRow,
  type SearchInsightsQueryRow,
  type SearchInsightsRows,
} from "./top-rows-model";
import {
  SEARCH_INSIGHTS_DEFAULT_SORT,
  type SearchInsightsSort,
  type SearchInsightsSortKey,
} from "./top-rows-sort";
import { searchInsightsWindowFilter } from "./window-filter";

export type TopRowsPage = {
  limit: number;
  offset: number;
  sort?: SearchInsightsSort;
};

export const EMPTY_ROWS = { rows: [], total: 0 } as const;

export type LandingPageGa4Metrics = {
  engagementRate: number | null;
  keyEvents: number | null;
  sessions: number | null;
};

type LandingPageGa4Aggregate = {
  engagedSessions: bigint | number | null;
  keyEvents: bigint | number | null;
  keyHash: string;
  sessions: bigint | number | null;
};

const EMPTY_LANDING_PAGE_GA4_METRICS: LandingPageGa4Metrics = {
  engagementRate: null,
  keyEvents: null,
  sessions: null,
};

/** Only the ratios divide, so only they can be NULL for a row with no impressions. */
const NULLABLE_SORT_KEYS: ReadonlySet<SearchInsightsSortKey> = new Set(["ctr", "position"]);

/**
 * The sort expressions, one per key, as SQL the read owns. Keys arrive from the client, so they
 * index this table rather than reaching a statement: an ORDER BY assembled from request text is
 * the one place a read of this shape can be turned into something else.
 */
function sortExpression(key: SearchInsightsSortKey, textColumn: Prisma.Sql) {
  switch (key) {
    case "clicks":
      return Prisma.sql`SUM("clicks")`;
    case "impressions":
      return Prisma.sql`SUM("impressions")`;
    case "ctr":
      return Prisma.sql`SUM("clicks")::float8 / NULLIF(SUM("impressions"), 0)`;
    case "position":
      return Prisma.sql`SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0)`;
    default:
      return textColumn;
  }
}

/**
 * The text column always breaks the tie, and it is unique per grouped row, so a page boundary can
 * never repeat a row or drop one however many rows share a metric value. `NULLS LAST` in both
 * directions keeps a row with no impressions - where CTR and position are undefined - at the end
 * rather than at the head of an ascending sort, where it would read as the best result.
 */
function searchInsightsOrderBy(sort: SearchInsightsSort, textColumn: Prisma.Sql) {
  const direction = sort.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  if (sort.key === "text") return Prisma.sql`${textColumn} ${direction}`;
  const nulls = NULLABLE_SORT_KEYS.has(sort.key) ? Prisma.sql` NULLS LAST` : Prisma.empty;
  return Prisma.sql`${sortExpression(sort.key, textColumn)} ${direction}${nulls}, ${textColumn} ASC`;
}

// The text always breaks ties, so a page boundary can never repeat or skip a row whichever
// column the reader sorted by.
function slice(page: TopRowsPage) {
  const limit = Math.max(0, Math.min(page.limit, ROWS_PAGE_LIMIT));
  return {
    limit,
    offset: Math.max(0, page.offset),
    sort: page.sort ?? SEARCH_INSIGHTS_DEFAULT_SORT,
  };
}

/**
 * `COUNT(*) OVER ()` runs after the grouping and before the limit, so one statement answers
 * both "which rows does this page show" and "how many rows does the window hold".
 */
export async function getTopQueries(
  projectId: string,
  property: string,
  window: DateWindow,
  page: TopRowsPage,
): Promise<SearchInsightsRows<SearchInsightsQueryRow>> {
  const { limit, offset, sort } = slice(page);
  if (limit === 0) return EMPTY_ROWS;
  const rows = await prisma.$queryRaw<(AggregatedRow & { query: string })[]>(Prisma.sql`
    SELECT
      "query",
      SUM("clicks") AS "clicks",
      SUM("impressions") AS "impressions",
      SUM("position" * "impressions") AS "positionWeight",
      COUNT(*) OVER () AS "total"
    FROM "search_analytics_query_daily"
    WHERE ${searchInsightsWindowFilter(projectId, property, window)}
    GROUP BY "query"
    ORDER BY ${searchInsightsOrderBy(sort, Prisma.sql`"query"`)}
    LIMIT ${limit} OFFSET ${offset}
  `);
  return queryRows(rows);
}

/**
 * The second-source page lookup shared by every page surface. It deliberately keeps a whole
 * window unknown when any contributing GA4 row is unknown, rather than making a partial sum
 * look complete.
 */
export async function getLandingPageGa4Metrics(
  projectId: string,
  sessionsProperty: string | null,
  window: DateWindow,
  pages: readonly string[],
): Promise<Map<string, LandingPageGa4Metrics>> {
  if (!sessionsProperty || pages.length === 0) return new Map();
  const pagesWithHashes = pages.map((page) => ({
    hash: dimensionKeyHash([normalizeLandingPath(page)]),
    page,
  }));
  const hashes = [...new Set(pagesWithHashes.map(({ hash }) => hash))];
  const sessions = await prisma.$queryRaw<LandingPageGa4Aggregate[]>(Prisma.sql`
    SELECT
      "keyHash",
      SUM("sessions") AS "sessions",
      CASE WHEN bool_or("engagedSessions" IS NULL) THEN NULL ELSE SUM("engagedSessions") END AS "engagedSessions",
      CASE WHEN bool_or("keyEvents" IS NULL) THEN NULL ELSE SUM("keyEvents") END AS "keyEvents"
    FROM "organic_sessions_page_daily"
    WHERE ${sessionsWindowFilter(projectId, sessionsProperty, window)}
      AND "keyHash" IN (${Prisma.join(hashes)})
    GROUP BY "keyHash"
  `);
  const numberOrNull = (value: bigint | number | null) => (value === null ? null : Number(value));
  const byHash = new Map(
    sessions.map((row) => [
      row.keyHash,
      {
        engagedSessions: numberOrNull(row.engagedSessions),
        keyEvents: numberOrNull(row.keyEvents),
        sessions: numberOrNull(row.sessions),
      },
    ]),
  );
  return new Map(
    pagesWithHashes.map(({ hash, page }) => {
      const metrics = byHash.get(hash);
      const sessions = metrics?.sessions ?? null;
      const engagedSessions = metrics?.engagedSessions ?? null;
      return [
        page,
        {
          engagementRate:
            sessions === null || sessions === 0 || engagedSessions === null
              ? null
              : engagedSessions / sessions,
          keyEvents: metrics?.keyEvents ?? null,
          sessions,
        },
      ];
    }),
  );
}

export async function getTopPages(
  projectId: string,
  property: string,
  window: DateWindow,
  page: TopRowsPage,
  sessionsProperty: string | null = null,
): Promise<SearchInsightsRows<SearchInsightsPageRow>> {
  const { limit, offset, sort } = slice(page);
  if (limit === 0) return EMPTY_ROWS;
  const rows = await prisma.$queryRaw<(AggregatedRow & { page: string })[]>(Prisma.sql`
    SELECT
      "page",
      SUM("clicks") AS "clicks",
      SUM("impressions") AS "impressions",
      SUM("position" * "impressions") AS "positionWeight",
      COUNT(*) OVER () AS "total"
    FROM "search_analytics_page_daily"
    WHERE ${searchInsightsWindowFilter(projectId, property, window)}
    GROUP BY "page"
    ORDER BY ${searchInsightsOrderBy(sort, Prisma.sql`"page"`)}
    LIMIT ${limit} OFFSET ${offset}
  `);
  const result = pageRows(rows);
  if (!sessionsProperty || result.rows.length === 0) return result;
  const metricsByPage = await getLandingPageGa4Metrics(
    projectId,
    sessionsProperty,
    window,
    result.rows.map((row) => row.url),
  );
  return {
    ...result,
    rows: result.rows.map((row) => ({
      ...row,
      ...(metricsByPage.get(row.url) ?? EMPTY_LANDING_PAGE_GA4_METRICS),
    })),
  };
}
