import "server-only";

import type { ChartMarker } from "@/lib/annotations/marker-style";
import { prisma } from "@/lib/db/prisma";
import { readChartAnnotations } from "@/lib/queries/chart-annotations";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { dateFromKey, dateKey, type FinalizedWindow } from "@/lib/search-insights/dates";
import { buildDailyClickPoints, type DailyClickPoint } from "./daily-clicks-model";

export type SearchInsightsDailyClicks = {
  markers: ChartMarker[];
  points: DailyClickPoint[];
};

type DailyClicksScope = {
  projectId: string;
  property: string;
  window: FinalizedWindow;
};

export async function getSearchInsightsDailyClicks(
  scope: DailyClicksScope,
): Promise<SearchInsightsDailyClicks> {
  const start = scope.window.current.start;
  const end = scope.window.current.end;
  const [rows, markers] = await Promise.all([
    prisma.searchAnalyticsDaily.findMany({
      orderBy: { date: "asc" },
      select: { clicks: true, date: true },
      where: {
        date: { gte: dateFromKey(start), lte: dateFromKey(end) },
        projectId: scope.projectId,
        property: scope.property,
        searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      },
    }),
    readChartAnnotations(scope.projectId, { fromKey: start, toKey: end }),
  ]);
  return {
    markers,
    points: buildDailyClickPoints(
      start,
      end,
      rows.map((row) => ({ clicks: row.clicks, dateKey: dateKey(row.date) })),
    ),
  };
}
