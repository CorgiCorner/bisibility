import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { DateWindow } from "@/lib/search-insights/dates";
import { searchInsightsWindowFilter } from "./window-filter";

export type SearchInsightsCounts = { queries: number };

/**
 * How many distinct query texts the window holds. It is the export button's promise about row
 * count, so it selects through the same window predicate the export does.
 *
 * Counting grouped text beats counting distinct hashes: the hash count already gets a
 * zero-heap-fetch index-only scan, so its cost is the sort and deduplication, and it spilled.
 * Measured cold on a production-shaped instance: 543 ms to 441 ms at 28 days, 2,617 ms to
 * 1,173 ms at 90.
 */
export async function getWindowCounts(
  projectId: string,
  property: string,
  window: DateWindow,
): Promise<SearchInsightsCounts> {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  const rows = await prisma.$queryRaw<{ queries: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS "queries"
    FROM (
      SELECT "query"
      FROM "search_analytics_query_daily"
      WHERE ${filter}
      GROUP BY "query"
    ) AS "groupedQueries"
  `);
  return { queries: Number(rows.at(0)?.queries ?? 0) };
}
