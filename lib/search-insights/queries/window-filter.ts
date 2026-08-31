import { Prisma } from "@/lib/generated/prisma/client";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import type { DateWindow } from "@/lib/search-insights/dates";

/**
 * One predicate for every read of the daily tables: the count the Export CSV button promises and
 * the rows the export delivers must select the same days. The bounds are cast to date so a
 * session time zone can never shift a day-only column by one bucket.
 */
export function searchInsightsWindowFilter(
  projectId: string,
  property: string,
  window: DateWindow,
) {
  return Prisma.sql`
    "projectId" = ${projectId}
    AND "property" = ${property}
    AND "searchType" = ${SEARCH_INSIGHTS_SEARCH_TYPE}
    AND "date" BETWEEN ${window.start}::date AND ${window.end}::date
  `;
}
