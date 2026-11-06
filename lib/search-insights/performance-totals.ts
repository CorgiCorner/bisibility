import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createGscSearchAnalyticsSession } from "@/lib/providers/analytics/gsc-search-analytics";
import type { ProviderCredentials } from "@/lib/providers/types";
import { getWindowTotals } from "@/lib/search-insights/queries/kpis";
import type { WindowTotals } from "@/lib/search-insights/queries/kpis-model";
import { type DateWindow, dateFromKey, dateKey, type FinalizedWindow } from "./dates";
import {
  aggregateCoverage,
  livePerformancePeriods,
  type PerformancePeriod,
} from "./performance-totals-model";

export type PerformanceTotalsInput = {
  projectId: string;
  property: string;
  credentials: ProviderCredentials;
  window: FinalizedWindow;
  comparePrevious: boolean;
  signal?: AbortSignal;
};

async function storedPeriod(
  input: PerformanceTotalsInput,
  dates: DateWindow,
  totals: WindowTotals,
  fetchedAt: Date,
): Promise<PerformancePeriod> {
  const range = await prisma.searchAnalyticsDaily.aggregate({
    _min: { date: true },
    _max: { date: true },
    where: {
      projectId: input.projectId,
      property: input.property,
      searchType: "web",
      impressions: { gt: 0 },
      date: { gte: dateFromKey(dates.start), lte: dateFromKey(dates.end) },
    },
  });
  return {
    ...totals,
    start_date: dates.start,
    end_date: dates.end,
    data_start_date: range._min.date ? dateKey(range._min.date) : null,
    data_end_date: range._max.date ? dateKey(range._max.date) : null,
    freshness: {
      data_state: "final",
      fetched_at: fetchedAt.toISOString(),
      finalized_through: dates.end,
      first_incomplete_date: null,
    },
  };
}

export async function readPerformanceTotals(input: PerformanceTotalsInput) {
  input.signal?.throwIfAborted();
  const start = input.comparePrevious ? input.window.previous.start : input.window.current.start;
  const ranges = await prisma.searchAnalyticsRequestUsage.findMany({
    select: { startDate: true, endDate: true, persistedAt: true },
    where: {
      projectId: input.projectId,
      property: input.property,
      source: "gsc",
      searchType: "web",
      operation: "aggregate",
      dimensions: "date",
      dataState: "final",
      persistedAt: { not: null },
      failureClass: null,
      capHit: false,
      startDate: { lte: dateFromKey(input.window.current.end) },
      endDate: { gte: dateFromKey(start) },
    },
  });
  input.signal?.throwIfAborted();
  const coveredAt = aggregateCoverage(ranges, start, input.window.current.end);
  if (coveredAt) {
    const totals = await getWindowTotals(input.projectId, input.property, input.window);
    const current = await storedPeriod(input, input.window.current, totals.current, coveredAt);
    const previous = input.comparePrevious
      ? await storedPeriod(input, input.window.previous, totals.previous, coveredAt)
      : null;
    input.signal?.throwIfAborted();
    return {
      property: input.property,
      search_type: "web" as const,
      source: "stored" as const,
      current,
      previous,
    };
  }
  // At most 732 inclusive days fit below the 1000-row cap: date is the only dimension.
  const session = await createGscSearchAnalyticsSession(input.credentials, input.signal);
  const envelope = await session.fetchEnvelope({
    dimensions: ["date"],
    rowLimit: 1000,
    startDate: start,
    endDate: input.window.current.end,
    dataState: "all",
    type: "web",
    signal: input.signal,
  });
  input.signal?.throwIfAborted();
  return {
    property: input.property,
    search_type: "web" as const,
    source: "live" as const,
    ...livePerformancePeriods(envelope, input.window, input.comparePrevious, new Date()),
  };
}
