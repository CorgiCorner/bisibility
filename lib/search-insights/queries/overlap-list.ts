import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { OVERLAP_SPLIT_ROWS } from "@/lib/search-insights/constants";
import type { DateWindow } from "@/lib/search-insights/dates";
import { loadSearchInsightsScope } from "./context";
import { drawerListLimit, EMPTY_LIST, type SearchInsightsList } from "./detail-model";
import { overlapPageFloorSql, overlapQueriesSql } from "./signals";
import { pagePath } from "./top-rows-model";
import { searchInsightsWindowFilter } from "./window-filter";

export type SearchInsightsOverlapPage = {
  clicks: number;
  path: string;
  /** The full page, because a domain property can hold the same path on two hosts. */
  url: string;
};

export type SearchInsightsOverlapRow = {
  clicks: number;
  /** How many of the project's own pages hold a meaningful share of this query. */
  pages: number;
  /** The query's own average position, the number the row's third column carries. */
  position: number | null;
  query: string;
  /** The busiest of those pages, shown inline as the evidence for the badge. */
  split: readonly SearchInsightsOverlapPage[];
};

type OverlapRow = {
  clicks: bigint;
  pages: bigint;
  position: number | null;
  query: string;
  total: bigint;
};

type SplitRow = {
  clicks: bigint;
  page: string;
  query: string;
};

/**
 * The split behind each overlap row: the busiest pages of the query, under the very predicate the
 * count is built from, so the badge and the lines below it can never describe different pages.
 */
async function readSplits(filter: Prisma.Sql, queries: readonly string[]) {
  if (queries.length === 0) return new Map<string, SearchInsightsOverlapPage[]>();
  const rows = await prisma.$queryRaw<SplitRow[]>(Prisma.sql`
    WITH "pages" AS (
      SELECT "query", "page", SUM("clicks") AS "clicks"
      FROM "search_analytics_query_page_daily"
      WHERE ${filter} AND "query" IN (${Prisma.join(queries)})
      GROUP BY "query", "page"
    ),
    "ranked" AS (
      SELECT
        "query",
        "page",
        "clicks",
        ROW_NUMBER() OVER (PARTITION BY "query" ORDER BY "clicks" DESC, "page" ASC) AS "rank"
      FROM "pages"
      WHERE ${overlapPageFloorSql}
    )
    SELECT "query", "page", "clicks"
    FROM "ranked"
    WHERE "rank" <= ${OVERLAP_SPLIT_ROWS}
    ORDER BY "query" ASC, "clicks" DESC
  `);
  const splits = new Map<string, SearchInsightsOverlapPage[]>();
  for (const row of rows) {
    const split = splits.get(row.query) ?? [];
    split.push({ clicks: Number(row.clicks), path: pagePath(row.page), url: row.page });
    splits.set(row.query, split);
  }
  return splits;
}

/**
 * The queries the overlap chip counts, most clicks first. The selection is the chip's own
 * predicate, so the number on the chip is always the length of this list. The average position
 * is joined from the query table rather than folded from the page pivot: the row names where the
 * query itself ranks, not where any one of the competing pages does.
 */
export async function getOverlapQueries(
  projectId: string,
  property: string,
  window: DateWindow,
  options: { limit?: number } = {},
): Promise<SearchInsightsList<SearchInsightsOverlapRow>> {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  const rows = await prisma.$queryRaw<OverlapRow[]>(Prisma.sql`
    SELECT
      "overlap"."query",
      "overlap"."clicks",
      "overlap"."pages",
      "ranking"."position",
      COUNT(*) OVER () AS "total"
    FROM (${overlapQueriesSql(filter)}) AS "overlap"
    LEFT JOIN (
      SELECT
        "query",
        SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0) AS "position"
      FROM "search_analytics_query_daily"
      WHERE ${filter}
      GROUP BY "query"
    ) AS "ranking" ON "ranking"."query" = "overlap"."query"
    ORDER BY "overlap"."clicks" DESC, "overlap"."query" ASC
    LIMIT ${drawerListLimit(options.limit)}
  `);
  const splits = await readSplits(
    filter,
    rows.map((row) => row.query),
  );
  return {
    rows: rows.map((row) => ({
      clicks: Number(row.clicks),
      pages: Number(row.pages),
      position: row.position,
      query: row.query,
      split: splits.get(row.query) ?? [],
    })),
    total: Number(rows.at(0)?.total ?? 0),
  };
}

export async function loadOverlapQueries(
  projectRef: string,
  input: { limit?: number; period?: string; property?: string },
): Promise<SearchInsightsList<SearchInsightsOverlapRow>> {
  const scope = await loadSearchInsightsScope(projectRef, {
    period: input.period,
    property: input.property,
  });
  const window = scope.window?.current ?? null;
  if (!scope.property || !window) return EMPTY_LIST;
  return getOverlapQueries(scope.projectId, scope.property, window, { limit: input.limit });
}
