import { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { coverageTotalsSql } from "./coverage";
import { searchInsightsWindowFilter } from "./window-filter";

type CoverageTotals = {
  namedClicks: number;
  namedImpressions: number;
  totalClicks: number;
  totalImpressions: number;
};

function legacyCoverageTotalsSql(filter: Prisma.Sql) {
  return Prisma.sql`
    SELECT
      (SELECT COALESCE(SUM("clicks"), 0) FROM "search_analytics_query_daily"
        WHERE ${filter}) AS "namedClicks",
      (SELECT COALESCE(SUM("impressions"), 0) FROM "search_analytics_query_daily"
        WHERE ${filter}) AS "namedImpressions",
      (SELECT COALESCE(SUM("clicks"), 0) FROM "search_analytics_daily"
        WHERE ${filter}) AS "totalClicks",
      (SELECT COALESCE(SUM("impressions"), 0) FROM "search_analytics_daily"
        WHERE ${filter}) AS "totalImpressions"
  `;
}

async function query(database: PGlite, statement: Prisma.Sql) {
  return database.query<CoverageTotals>(statement.text, statement.values);
}

describe("coverage SQL rewrite", () => {
  it("returns the same totals as the four-scan form on one fixture", async () => {
    const database = new PGlite();
    await database.exec(`
      CREATE TABLE "search_analytics_query_daily" (
        "projectId" TEXT NOT NULL,
        "property" TEXT NOT NULL,
        "searchType" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "clicks" INTEGER NOT NULL,
        "impressions" INTEGER NOT NULL
      );
      CREATE TABLE "search_analytics_daily" (
        "projectId" TEXT NOT NULL,
        "property" TEXT NOT NULL,
        "searchType" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "clicks" INTEGER NOT NULL,
        "impressions" INTEGER NOT NULL
      );
      INSERT INTO "search_analytics_query_daily" VALUES
        ('project_1', 'sc-domain:example.com', 'web', '2020-01-10', 7, 70),
        ('project_1', 'sc-domain:example.com', 'web', '2020-01-11', 5, 30),
        ('project_1', 'sc-domain:example.com', 'web', '2019-12-31', 90, 900),
        ('other_project', 'sc-domain:example.com', 'web', '2020-01-10', 80, 800);
      INSERT INTO "search_analytics_daily" VALUES
        ('project_1', 'sc-domain:example.com', 'web', '2020-01-10', 10, 100),
        ('project_1', 'sc-domain:example.com', 'web', '2020-01-11', 10, 100),
        ('project_1', 'sc-domain:example.com', 'image', '2020-01-10', 60, 600);
    `);

    const filter = searchInsightsWindowFilter("project_1", "sc-domain:example.com", {
      end: "2020-01-11",
      start: "2020-01-10",
    });

    try {
      const legacy = await query(database, legacyCoverageTotalsSql(filter));
      const rewritten = await query(database, coverageTotalsSql(filter));
      expect(rewritten.rows).toEqual(legacy.rows);
      expect(rewritten.rows).toEqual([
        {
          namedClicks: 12,
          namedImpressions: 100,
          totalClicks: 20,
          totalImpressions: 200,
        },
      ]);
    } finally {
      await database.close();
    }
  }, 30_000);
});
