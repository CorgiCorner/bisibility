import { Prisma } from "@/lib/generated/prisma/client";
import type { DateWindow } from "@/lib/search-insights/dates";

/** Predicate shared by session totals and landing-page joins. */
export function sessionsWindowFilter(projectId: string, property: string, window: DateWindow) {
  return Prisma.sql`
    "projectId" = ${projectId}
    AND "property" = ${property}
    AND "date" BETWEEN ${window.start}::date AND ${window.end}::date
  `;
}
