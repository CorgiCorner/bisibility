import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { SEARCH_INSIGHTS_EXPORT_ROW_CAP } from "@/lib/search-insights/constants";
import type { DateWindow } from "@/lib/search-insights/dates";
import { csvRow } from "@/lib/ui/csv";
import { loadSearchInsightsScope } from "./context";
import { exportFilename, queryExportRows } from "./query-export-model";
import { searchInsightsWindowFilter } from "./window-filter";

export type SearchInsightsCsv = {
  csv: string;
  filename: string;
  rows: number;
  /** The window holds more queries than the cap, so the file stops at the busiest ones. */
  truncated: boolean;
};

export type QueryTotalsRow = {
  clicks: bigint | number;
  impressions: bigint | number;
  positionWeight: number;
  query: string;
};

const HEADER = ["query", "clicks", "impressions", "ctr", "avg_position"] as const;

// Aggregated in the database, and capped: an export is not a page of a table, and it is not a
// licence for one click to materialize every query a saturated property stored in the window.
export async function loadSearchInsightsQueryTotals(
  projectId: string,
  property: string,
  window: DateWindow,
): Promise<QueryTotalsRow[]> {
  return prisma.$queryRaw<QueryTotalsRow[]>(Prisma.sql`
    SELECT
      "query",
      SUM("clicks") AS "clicks",
      SUM("impressions") AS "impressions",
      SUM("position" * "impressions") AS "positionWeight"
    FROM "search_analytics_query_daily"
    WHERE ${searchInsightsWindowFilter(projectId, property, window)}
    GROUP BY "query"
    ORDER BY SUM("clicks") DESC, "query" ASC
    LIMIT ${SEARCH_INSIGHTS_EXPORT_ROW_CAP}
  `);
}

export function searchInsightsQueryCsv(input: {
  property: string;
  rows: readonly QueryTotalsRow[];
  window: DateWindow | null;
}): SearchInsightsCsv {
  const rows = queryExportRows(input.rows);
  return {
    csv: [csvRow(HEADER), ...rows.map(csvRow)].join("\n"),
    filename: exportFilename(input.property, input.window),
    rows: rows.length,
    truncated: rows.length >= SEARCH_INSIGHTS_EXPORT_ROW_CAP,
  };
}

// The scope, not the full context: an export needs the property and the window, and the
// context's two COUNT(DISTINCT) scans would double the work of every click.
export async function getSearchInsightsQueryCsv(
  projectRef: string,
  period?: string,
): Promise<SearchInsightsCsv> {
  const scope = await loadSearchInsightsScope(projectRef, { period });
  const window = scope.window?.current ?? null;
  const rows =
    scope.property && window
      ? await loadSearchInsightsQueryTotals(scope.projectId, scope.property, window)
      : [];
  return searchInsightsQueryCsv({ property: scope.property ?? "", rows, window });
}
