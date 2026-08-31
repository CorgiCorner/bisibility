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
import { searchInsightsWindowFilter } from "./window-filter";

export type TopRowsPage = {
  limit: number;
  offset: number;
};

export const EMPTY_ROWS = { rows: [], total: 0 } as const;

// Fixed clicks-desc in v1; the text breaks ties so a page boundary can never repeat or skip a
// row. Column sorting belongs to the explorer route, not to the first view.
function slice(page: TopRowsPage) {
  const limit = Math.max(0, Math.min(page.limit, ROWS_PAGE_LIMIT));
  return { limit, offset: Math.max(0, page.offset) };
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
  const { limit, offset } = slice(page);
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
    ORDER BY SUM("clicks") DESC, "query" ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return queryRows(rows);
}

export async function getTopPages(
  projectId: string,
  property: string,
  window: DateWindow,
  page: TopRowsPage,
  sessionsProperty: string | null = null,
): Promise<SearchInsightsRows<SearchInsightsPageRow>> {
  const { limit, offset } = slice(page);
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
    ORDER BY SUM("clicks") DESC, "page" ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const result = pageRows(rows);
  if (!sessionsProperty || result.rows.length === 0) return result;
  const rowsWithHashes = result.rows.map((row) => ({
    hash: dimensionKeyHash([normalizeLandingPath(row.url)]),
    row,
  }));
  const hashes = rowsWithHashes.map(({ hash }) => hash);
  const sessions = await prisma.$queryRaw<Array<{ keyHash: string; sessions: bigint }>>(Prisma.sql`
    SELECT "keyHash", SUM("sessions") AS "sessions"
    FROM "organic_sessions_page_daily"
    WHERE ${sessionsWindowFilter(projectId, sessionsProperty, window)}
      AND "keyHash" IN (${Prisma.join(hashes)})
    GROUP BY "keyHash"
  `);
  const byHash = new Map(sessions.map((row) => [row.keyHash, Number(row.sessions)]));
  return {
    ...result,
    rows: rowsWithHashes.map(({ hash, row }) => ({
      ...row,
      sessions: byHash.get(hash) ?? null,
    })),
  };
}
