import "server-only";

import { prisma } from "@/lib/db/prisma";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { addDays, dateFromKey, dateKey } from "@/lib/search-insights/dates";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";
import {
  type ImportObservabilityFacts,
  summarizeImportObservability,
} from "./import-observability";

const COVERAGE_DAYS = 90 * 2;

export async function readImportObservability(input: {
  batchSize?: number;
  daysTotal: number;
  earliestTargetDate: Date | null;
  lastProbeAt?: Date | null;
  newestFinalizedDate: Date | null;
  now?: Date;
  plannedRetentionMonths?: number;
  projectId: string;
  property: string;
  requestSetsPerHour?: number;
}): Promise<ImportObservabilityFacts> {
  const boundary = input.newestFinalizedDate ? dateKey(input.newestFinalizedDate) : null;
  const coverageStart = boundary ? addDays(boundary, -(COVERAGE_DAYS - 1)) : null;
  const earliestTargetDate = input.earliestTargetDate ? dateKey(input.earliestTargetDate) : null;
  const partitionStart = earliestTargetDate ?? coverageStart;
  const [partitions, request, aggregateRanges] = await Promise.all([
    boundary
      ? prisma.searchAnalyticsSyncPartition.findMany({
          select: { date: true, dimensions: true, fetchedAt: true },
          where: {
            dataState: "final",
            dimensions: { in: ["query", "page", "query,page"] },
            date: { gte: dateFromKey(partitionStart as string), lte: dateFromKey(boundary) },
            projectId: input.projectId,
            property: input.property,
            searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
            source: SEARCH_INSIGHTS_SOURCE,
          },
        })
      : Promise.resolve([]),
    prisma.searchAnalyticsRequestUsage.findFirst({
      orderBy: { attemptedAt: "desc" },
      select: { attemptedAt: true },
      where: { projectId: input.projectId, property: input.property },
    }),
    boundary && coverageStart
      ? prisma.searchAnalyticsRequestUsage.findMany({
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
            endDate: { gte: dateFromKey(coverageStart) },
            operation: "aggregate",
            persistedAt: { not: null },
            projectId: input.projectId,
            property: input.property,
            searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
            source: SEARCH_INSIGHTS_SOURCE,
            startDate: { lte: dateFromKey(boundary) },
          },
        })
      : Promise.resolve([]),
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
    batchSize: input.batchSize,
    boundary,
    daysTotal: input.daysTotal,
    earliestTargetDate,
    lastProbeAt: input.lastProbeAt?.toISOString() ?? null,
    latestRequestAttemptAt: request?.attemptedAt.toISOString() ?? null,
    now: input.now ?? new Date(),
    plannedRetentionMonths: input.plannedRetentionMonths,
    requestSetsPerHour: input.requestSetsPerHour,
    rows: partitions.map((row) => ({
      date: dateKey(row.date),
      dimensions: row.dimensions,
      fetchedAt: row.fetchedAt.toISOString(),
    })),
  });
}
