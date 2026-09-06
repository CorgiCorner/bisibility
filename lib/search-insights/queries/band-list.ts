import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { DateWindow } from "@/lib/search-insights/dates";
import { loadSearchInsightsScope } from "./context";
import { drawerListLimit, EMPTY_LIST, type SearchInsightsList } from "./detail-model";
import { positionBandQuerySql } from "./signals";
import { searchInsightsWindowFilter } from "./window-filter";

export type SearchInsightsBandRow = {
  clicks: number;
  impressions: number;
  position: number;
  query: string;
};

type BandRow = {
  clicks: bigint;
  impressions: bigint;
  position: number;
  query: string;
  total: bigint;
};

/**
 * The queries the band chip counts, in the order the drawer names: biggest demand first, because
 * the impression pool is what a better position converts. The selection is the chip's own
 * predicate, so the number on the chip is always the length of this list.
 */
export async function getPositionBandQueries(
  projectId: string,
  property: string,
  window: DateWindow,
  options: { limit?: number } = {},
): Promise<SearchInsightsList<SearchInsightsBandRow>> {
  const filter = searchInsightsWindowFilter(projectId, property, window);
  const rows = await prisma.$queryRaw<BandRow[]>(Prisma.sql`
    SELECT "query", "clicks", "impressions", "position", COUNT(*) OVER () AS "total"
    FROM (${positionBandQuerySql(filter)}) AS "band"
    ORDER BY "impressions" DESC, "query" ASC
    LIMIT ${drawerListLimit(options.limit)}
  `);
  return {
    rows: rows.map((row) => ({
      clicks: Number(row.clicks),
      impressions: Number(row.impressions),
      position: Number(row.position),
      query: row.query,
    })),
    total: Number(rows.at(0)?.total ?? 0),
  };
}

export async function loadPositionBandQueries(
  projectRef: string,
  input: { comparison?: string; limit?: number; period?: string; property?: string },
): Promise<SearchInsightsList<SearchInsightsBandRow>> {
  const scope = await loadSearchInsightsScope(projectRef, {
    ...(input.comparison ? { comparison: input.comparison } : {}),
    period: input.period,
    property: input.property,
  });
  const window = scope.window?.current ?? null;
  if (!scope.property || !window) return EMPTY_LIST;
  return getPositionBandQueries(scope.projectId, scope.property, window, { limit: input.limit });
}
