import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { DateWindow } from "@/lib/search-insights/dates";
import { countCappedDays, PARTITION_DIMENSION_KEYS } from "@/lib/search-insights/sync/partitions";
import { searchInsightsWindowFilter } from "./window-filter";

export type SearchInsightsCoverage = {
  /** True only when the local aggregate provenance makes this window readable. */
  calculable: boolean;
  /** Days in the window where the provider returned its row ceiling for a request set. */
  capHitDays: number;
  /** Integer percent of the window's clicks whose query text the provider named. */
  clicksShare: number;
  /** Integer percent of the window's impressions whose query text the provider named. */
  impressionsShare: number;
};

type CoverageRow = {
  namedClicks: bigint | number;
  namedImpressions: bigint | number;
  totalClicks: bigint | number;
  totalImpressions: bigint | number;
};

export const EMPTY_COVERAGE: SearchInsightsCoverage = {
  calculable: false,
  capHitDays: 0,
  clicksShare: 0,
  impressionsShare: 0,
};

// A zero denominator can be a genuine, provenance-backed 0% window. Calculability is carried
// separately, so this helper only keeps division safe.
export function coverageShare(named: bigint | number, total: bigint | number) {
  const denominator = Number(total);
  if (denominator <= 0) return 0;
  return Math.round((Number(named) / denominator) * 100);
}

export function coverageTotalsSql(filter: Prisma.Sql) {
  return Prisma.sql`
    SELECT
      "query_totals"."namedClicks",
      "query_totals"."namedImpressions",
      "daily_totals"."totalClicks",
      "daily_totals"."totalImpressions"
    FROM (
      SELECT
        COALESCE(SUM("clicks"), 0) AS "namedClicks",
        COALESCE(SUM("impressions"), 0) AS "namedImpressions"
      FROM "search_analytics_query_daily"
      WHERE ${filter}
    ) AS "query_totals"
    CROSS JOIN (
      SELECT
        COALESCE(SUM("clicks"), 0) AS "totalClicks",
        COALESCE(SUM("impressions"), 0) AS "totalImpressions"
      FROM "search_analytics_daily"
      WHERE ${filter}
    ) AS "daily_totals"
  `;
}

/**
 * How much of the window the named-query tables actually cover. The numerator is the
 * dimensional query table and the denominator is the aggregate table, which is exactly why the
 * two tables on this screen never sum to the KPI row.
 */
export async function getQueryCoverage(
  projectId: string,
  property: string,
  window: DateWindow,
): Promise<SearchInsightsCoverage> {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  const [rows, capHitDays] = await Promise.all([
    prisma.$queryRaw<CoverageRow[]>(coverageTotalsSql(filter)),
    // Only the dimensional request sets: a capped aggregate request would be a different kind
    // of problem and is not what the coverage sentence is about.
    countCappedDays({ dimensions: PARTITION_DIMENSION_KEYS, projectId, property, window }),
  ]);

  const row = rows.at(0);
  if (!row) return { ...EMPTY_COVERAGE, capHitDays };
  return {
    calculable: true,
    capHitDays,
    clicksShare: coverageShare(row.namedClicks, row.totalClicks),
    impressionsShare: coverageShare(row.namedImpressions, row.totalImpressions),
  };
}
