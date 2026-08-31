import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { FinalizedWindow } from "@/lib/search-insights/dates";
import {
  EMPTY_TOTALS,
  type TotalsRow,
  type WindowSessionsPair,
  type WindowTotalsPair,
  windowTotals,
} from "./kpis-model";
import { sessionsWindowFilter } from "./sessions-filter";
import { searchInsightsWindowFilter } from "./window-filter";

type BucketRow = TotalsRow & { bucket: string };

/**
 * Headline totals come from the aggregate table only. The dimensional tables are
 * privacy-filtered and row-capped by the provider, so summing them would quietly under-report
 * every number on the KPI row.
 *
 * The compared block ends the day before the current one begins, so both are read in one pass
 * over the spanning range and split by date rather than scanned twice.
 */
export async function getWindowTotals(
  projectId: string,
  property: string,
  window: FinalizedWindow,
): Promise<WindowTotalsPair> {
  const span = { end: window.current.end, start: window.previous.start };
  const rows = await prisma.$queryRaw<BucketRow[]>(Prisma.sql`
    SELECT
      CASE WHEN "date" >= ${window.current.start}::date THEN 'current' ELSE 'previous' END
        AS "bucket",
      SUM("clicks") AS "clicks",
      SUM("impressions") AS "impressions",
      SUM("position" * "impressions") AS "positionWeight"
    FROM "search_analytics_daily"
    WHERE ${searchInsightsWindowFilter(projectId, property, span)}
    GROUP BY 1
  `);

  return {
    current: windowTotals(rows.find((row) => row.bucket === "current")),
    previous: windowTotals(rows.find((row) => row.bucket === "previous")),
  };
}

export const EMPTY_WINDOW_TOTALS: WindowTotalsPair = {
  current: EMPTY_TOTALS,
  previous: EMPTY_TOTALS,
};

export const EMPTY_WINDOW_SESSIONS: WindowSessionsPair = { current: 0, previous: 0 };

export async function getOrganicSessionsTotals(
  projectId: string,
  property: string,
  window: FinalizedWindow,
): Promise<WindowSessionsPair> {
  const span = { end: window.current.end, start: window.previous.start };
  const rows = await prisma.$queryRaw<Array<{ bucket: string; sessions: bigint }>>(Prisma.sql`
    SELECT
      CASE WHEN "date" >= ${window.current.start}::date THEN 'current' ELSE 'previous' END
        AS "bucket",
      SUM("sessions") AS "sessions"
    FROM "organic_sessions_daily"
    WHERE ${sessionsWindowFilter(projectId, property, span)}
    GROUP BY 1
  `);
  return {
    current: Number(rows.find((row) => row.bucket === "current")?.sessions ?? 0),
    previous: Number(rows.find((row) => row.bucket === "previous")?.sessions ?? 0),
  };
}
