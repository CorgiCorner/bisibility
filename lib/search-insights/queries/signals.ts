import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  MIN_BAND_IMPRESSIONS,
  MIN_PAGE_CLICKS,
  MIN_QUERY_CLICKS,
  OVERLAP_FLOOR_SHARE,
  POSITION_BAND,
} from "@/lib/search-insights/constants";
import type { DateWindow } from "@/lib/search-insights/dates";
import { searchInsightsWindowFilter } from "./window-filter";

// A query has to be answered by more than one page before the overlap is worth naming.
const MIN_OVERLAP_PAGES = 2;

export type SearchInsightsSignals = {
  bandCount: number;
  overlapCount: number;
};

export const EMPTY_SIGNALS: SearchInsightsSignals = { bandCount: 0, overlapCount: 0 };

/**
 * The band membership rule, in one place. The chip counts what this selects and the drawer
 * lists what this selects, so the number on the chip is always the length of the list behind
 * it. Position alone would let a query nobody searches for look like an opportunity, so the
 * window impressions floor is part of the rule rather than a display filter.
 */
export function positionBandQuerySql(filter: Prisma.Sql) {
  return Prisma.sql`
    SELECT
      "query",
      SUM("clicks") AS "clicks",
      SUM("impressions") AS "impressions",
      SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0) AS "position"
    FROM "search_analytics_query_daily"
    WHERE ${filter}
    GROUP BY "query"
    HAVING SUM("impressions") >= ${MIN_BAND_IMPRESSIONS}
      AND SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0)
        BETWEEN ${POSITION_BAND.min} AND ${POSITION_BAND.max}
  `;
}

/**
 * The floor a page clears before it counts as an answer to the query, over a grouped "clicks"
 * column. Exported because the badge counts what this selects and the drawer lists what this
 * selects, so a change to the rule cannot leave the two describing different sets of pages.
 */
export const overlapPageFloorSql = Prisma.sql`"clicks" >= ${MIN_PAGE_CLICKS}`;

/**
 * The overlap rule, in one place, and read entirely from the query-by-page pivot so the count
 * and the evidence rows behind it can never disagree. A page holding a handful of clicks is
 * noise, and so is a query whose whole volume is a rounding error next to the busiest one in
 * the window, so both floors are part of the selection.
 */
export function overlapQueriesSql(filter: Prisma.Sql) {
  return Prisma.sql`
    WITH "overlap_pages" AS (
      SELECT "query", "page", SUM("clicks") AS "clicks"
      FROM "search_analytics_query_page_daily"
      WHERE ${filter}
      GROUP BY "query", "page"
    ),
    "overlap_queries" AS (
      SELECT
        "query",
        SUM("clicks") AS "clicks",
        COUNT(*) FILTER (WHERE ${overlapPageFloorSql}) AS "pages"
      FROM "overlap_pages"
      GROUP BY "query"
    )
    SELECT "query", "clicks", "pages"
    FROM "overlap_queries"
    WHERE "pages" >= ${MIN_OVERLAP_PAGES}
      AND "clicks" >= GREATEST(
        ${MIN_QUERY_CLICKS}::float8,
        ROUND(
          COALESCE((SELECT MAX("clicks") FROM "overlap_queries"), 0)::float8
            * ${OVERLAP_FLOOR_SHARE}::float8
        )
      )
  `;
}

async function countOf(statement: Prisma.Sql) {
  const rows = await prisma.$queryRaw<{ count: bigint | number }[]>(Prisma.sql`
    SELECT COUNT(*) AS "count" FROM (${statement}) AS "selected"
  `);
  return Number(rows.at(0)?.count ?? 0);
}

export function getPositionBandCount(projectId: string, property: string, window: DateWindow) {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  return countOf(positionBandQuerySql(filter));
}

export function getOverlapCount(projectId: string, property: string, window: DateWindow) {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  return countOf(overlapQueriesSql(filter));
}

export async function getSearchInsightsSignals(
  projectId: string,
  property: string,
  window: DateWindow,
): Promise<SearchInsightsSignals> {
  const [bandCount, overlapCount] = await Promise.all([
    getPositionBandCount(projectId, property, window),
    getOverlapCount(projectId, property, window),
  ]);
  return { bandCount, overlapCount };
}
