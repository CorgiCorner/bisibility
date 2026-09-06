import { Prisma } from "@/lib/generated/prisma/client";
import {
  MIN_PAGE_CLICKS,
  MIN_QUERY_CLICKS,
  OVERLAP_FLOOR_SHARE,
} from "@/lib/search-insights/constants";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { overlapListSql } from "./overlap-list";
import { overlapCountSql, overlapQueriesSql } from "./signals";
import { searchInsightsWindowFilter } from "./window-filter";

type OverlapSelection = { clicks: bigint; pages: bigint; query: string };

function legacyOverlapQueriesSql(filter: Prisma.Sql) {
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
        COUNT(*) FILTER (WHERE "clicks" >= ${MIN_PAGE_CLICKS}) AS "pages"
      FROM "overlap_pages"
      GROUP BY "query"
    )
    SELECT "query", "clicks", "pages"
    FROM "overlap_queries"
    WHERE "pages" >= 2
      AND "clicks" >= GREATEST(
        ${MIN_QUERY_CLICKS}::float8,
        ROUND(
          COALESCE((SELECT MAX("clicks") FROM "overlap_queries"), 0)::float8
            * ${OVERLAP_FLOOR_SHARE}::float8
        )
      )
  `;
}

async function query<T>(database: PGlite, statement: Prisma.Sql) {
  return database.query<T>(statement.text, statement.values);
}

function byQuery(rows: OverlapSelection[]) {
  return [...rows].sort((left, right) => left.query.localeCompare(right.query));
}

describe("overlap SQL rewrite", () => {
  it("matches the old selection and keeps the chip count equal to the drawer list", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TABLE "search_analytics_query_page_daily" (
        "projectId" TEXT NOT NULL,
        "property" TEXT NOT NULL,
        "searchType" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "query" TEXT NOT NULL,
        "page" TEXT NOT NULL,
        "clicks" INTEGER NOT NULL
      );
      CREATE TABLE "search_analytics_query_daily" (
        "projectId" TEXT NOT NULL,
        "property" TEXT NOT NULL,
        "searchType" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "query" TEXT NOT NULL,
        "clicks" INTEGER NOT NULL,
        "impressions" INTEGER NOT NULL,
        "position" DOUBLE PRECISION NOT NULL
      );
      INSERT INTO "search_analytics_query_page_daily" VALUES
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'busy', 'https://example.com/a', 18),
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'busy', 'https://example.com/b', 18),
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'at page floor', 'https://example.com/a', 3),
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'at page floor', 'https://example.com/b', 5),
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'below query floor', 'https://example.com/a', 3),
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'below query floor', 'https://example.com/b', 4),
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'below page floor', 'https://example.com/a', 2),
        ('project_query_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'below page floor', 'https://example.com/b', 8),
        ('project_share_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'busy', 'https://example.com/a', 20),
        ('project_share_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'busy', 'https://example.com/b', 20),
        ('project_share_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'at share floor', 'https://example.com/a', 4),
        ('project_share_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'at share floor', 'https://example.com/b', 5),
        ('project_share_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'below share floor', 'https://example.com/a', 4),
        ('project_share_floor', 'sc-domain:example.com', 'web', '2020-01-10', 'below share floor', 'https://example.com/b', 4);
      INSERT INTO "search_analytics_query_daily"
        SELECT DISTINCT "projectId", "property", "searchType", "date", "query", 1, 10, 5
        FROM "search_analytics_query_page_daily";
    `);

    try {
      for (const projectId of ["project_query_floor", "project_share_floor"]) {
        const filter = searchInsightsWindowFilter(projectId, "sc-domain:example.com", {
          end: "2020-01-10",
          start: "2020-01-10",
        });
        const legacy = await query<OverlapSelection>(database, legacyOverlapQueriesSql(filter));
        const rewritten = await query<OverlapSelection>(database, overlapQueriesSql(filter));
        const count = await query<{ count: bigint }>(database, overlapCountSql(filter));
        const list = await query<OverlapSelection>(database, overlapListSql(filter, 15));

        expect(byQuery(rewritten.rows)).toEqual(byQuery(legacy.rows));
        expect(Number(count.rows[0]?.count)).toBe(list.rows.length);
      }
    } finally {
      await database.close();
    }
  }, 30_000);
});
