import "server-only";

import { prisma } from "@/lib/db/prisma";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { addDays, dateFromKey, dateKey } from "@/lib/search-insights/dates";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";
import { type ImportObservability, summarizeImportObservability } from "./import-observability";

export async function readImportObservability(input: {
  daysTotal: number;
  earliestTargetDate: Date | null;
  newestFinalizedDate: Date | null;
  projectId: string;
  property: string;
  now?: Date;
}): Promise<ImportObservability> {
  const boundary = input.newestFinalizedDate ? dateKey(input.newestFinalizedDate) : null;
  const firstViewStart = boundary ? addDays(boundary, -27) : null;
  const [partitions, request, aggregateRanges] = await Promise.all([
    prisma.searchAnalyticsSyncPartition.findMany({
      select: { date: true, dimensions: true, fetchedAt: true },
      where: {
        dataState: "final",
        dimensions: { in: ["query", "page", "query,page"] },
        date:
          input.earliestTargetDate && input.newestFinalizedDate
            ? { gte: input.earliestTargetDate, lte: input.newestFinalizedDate }
            : undefined,
        projectId: input.projectId,
        property: input.property,
        searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
        source: SEARCH_INSIGHTS_SOURCE,
      },
    }),
    prisma.searchAnalyticsRequestUsage.findFirst({
      orderBy: { attemptedAt: "desc" },
      select: { attemptedAt: true },
      where: { projectId: input.projectId, property: input.property },
    }),
    prisma.searchAnalyticsRequestUsage.findMany({
      orderBy: { attemptedAt: "desc" },
      select: {
        dataState: true,
        dimensions: true,
        endDate: true,
        operation: true,
        persistedAt: true,
        searchType: true,
        source: true,
        startDate: true,
      },
      where: {
        dataState: "final",
        dimensions: "date",
        endDate: boundary ? { gte: dateFromKey(boundary) } : undefined,
        operation: "aggregate",
        persistedAt: { not: null },
        projectId: input.projectId,
        property: input.property,
        searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
        source: SEARCH_INSIGHTS_SOURCE,
        startDate: firstViewStart ? { lte: dateFromKey(firstViewStart) } : undefined,
      },
    }),
  ]);
  return summarizeImportObservability({
    aggregateRanges: aggregateRanges.map((range) => ({
      dataState: range.dataState,
      dimensions: range.dimensions,
      endDate: dateKey(range.endDate),
      operation: range.operation,
      persistedAt: range.persistedAt?.toISOString() ?? null,
      searchType: range.searchType,
      source: range.source,
      startDate: dateKey(range.startDate),
    })),
    boundary,
    earliestTargetDate: input.earliestTargetDate ? dateKey(input.earliestTargetDate) : null,
    daysTotal: input.daysTotal,
    latestRequestAttemptAt: request?.attemptedAt.toISOString() ?? null,
    now: input.now ?? new Date(),
    rows: partitions.map((row) => ({
      date: dateKey(row.date),
      dimensions: row.dimensions,
      fetchedAt: row.fetchedAt.toISOString(),
    })),
  });
}
