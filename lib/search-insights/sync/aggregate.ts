import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { GscSearchAnalyticsSession } from "@/lib/providers/analytics/gsc-search-analytics";
import {
  SEARCH_ANALYTICS_ROW_LIMIT,
  SEARCH_INSIGHTS_SEARCH_TYPE,
} from "@/lib/search-insights/constants";
import { addDays, dateFromKey, pacificToday } from "@/lib/search-insights/dates";
import { assertRequestedProperty, SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { accountSearchAnalyticsRequests } from "./request-usage";
import { chunk, numberValue } from "./rows";

// Dimensions for the requests that produce totals. Query and page rows are privacy
// filtered and row capped, so they never add up to these numbers.
const AGGREGATE_DIMENSIONS = "date";
const AGGREGATE_DATA_STATE = "final";

// Ten days is comfortably wider than any finalization lag the provider has shown, so the
// probe always spans the boundary between fresh and finalized days.
const FRESHNESS_PROBE_DAYS = 10;

// Used only when the provider sends no freshness metadata at all; same-day and
// previous-day data is never finalized, so two days back is the safe reading.
const METADATA_FALLBACK_LAG_DAYS = 2;

const AGGREGATE_CHUNK_SIZE = 100;
const AGGREGATE_TRANSACTION_TIMEOUT_MS = 120_000;

// The probe always names a day: the metadata answers directly, and the documented fallback
// answers from the probe window, so nothing downstream has to handle "no finalized day".
export type FreshnessProbe = {
  availabilityBoundarySource: "fallback" | "metadata";
  newestFinalizedDate: string;
  probedAt: Date;
};

function validDateKey(key: string | undefined) {
  if (!key) return null;
  try {
    dateFromKey(key);
    return key;
  } catch {
    return null;
  }
}

// dataState "all" is the only request that reports where finalized data stops. The
// answer comes from the response, never from a hardcoded lag. The site probed is the one
// the session holds; the caller never passes it separately.
export async function probeFreshness(input: {
  now: Date;
  session: GscSearchAnalyticsSession;
  projectId: string;
  property: string;
}): Promise<FreshnessProbe> {
  const endDate = pacificToday(input.now);
  const session = accountSearchAnalyticsRequests({
    operation: "probe",
    projectId: input.projectId,
    property: input.property,
    session: input.session,
  });
  const envelope = await session.fetchEnvelope({
    dataState: "all",
    dimensions: ["date"],
    endDate,
    rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
    startDate: addDays(endDate, -FRESHNESS_PROBE_DAYS),
    type: SEARCH_INSIGHTS_SEARCH_TYPE,
  });
  const probedAt = new Date();

  const firstIncompleteDate = validDateKey(envelope.metadata?.firstIncompleteDate);
  if (firstIncompleteDate) {
    return {
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: addDays(firstIncompleteDate, -1),
      probedAt,
    };
  }

  const returnedDates = envelope.rows
    .map((row) => validDateKey(row.keys[0]?.trim()))
    .filter((key): key is string => key !== null)
    .sort();
  // A property whose trailing days carry no traffic still has finalized days behind them, so
  // an empty answer falls back to the probe window instead of leaving the import unplannable.
  const boundary = returnedDates.at(-1) ?? endDate;
  return {
    availabilityBoundarySource: "fallback",
    newestFinalizedDate: addDays(boundary, -METADATA_FALLBACK_LAG_DAYS),
    probedAt,
  };
}

// One request covers the whole range: 500 days of daily totals fit far inside the row
// limit, so the sixteen-month history costs a single call.
export async function fetchAggregateRange(input: {
  end: string;
  projectId: string;
  property: string;
  session: GscSearchAnalyticsSession;
  start: string;
}): Promise<{ days: number }> {
  assertRequestedProperty(input.session.property, input.property);
  const startedAt = Date.now();
  let requestAttemptId: string | null = null;
  const session = accountSearchAnalyticsRequests({
    onSuccessfulAttempt: (id) => {
      requestAttemptId = id;
    },
    operation: "aggregate",
    projectId: input.projectId,
    property: input.property,
    session: input.session,
  });
  const envelope = await session.fetchEnvelope({
    dataState: "final",
    dimensions: ["date"],
    endDate: input.end,
    rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
    startDate: input.start,
    type: SEARCH_INSIGHTS_SEARCH_TYPE,
  });
  const fetchedAt = new Date();
  const durationMs = Date.now() - startedAt;

  const days = envelope.rows.flatMap((row) => {
    const date = validDateKey(row.keys[0]?.trim());
    if (!date) return [];
    return [
      {
        clicks: numberValue(row.clicks),
        ctr: numberValue(row.ctr),
        date,
        impressions: numberValue(row.impressions),
        position: numberValue(row.position),
      },
    ];
  });

  // Delete-then-insert over the days this request returned: a re-fetch is authoritative for
  // them, and a set-based write keeps the sixteen-month range at a handful of statements
  // rather than one round trip per day.
  const scope = {
    projectId: input.projectId,
    property: input.property,
    searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
  };
  for (const part of chunk(days, AGGREGATE_CHUNK_SIZE)) {
    const dates = part.map((day) => dateFromKey(day.date));
    await prisma.$transaction(
      async (tx) => {
        await tx.searchAnalyticsDaily.deleteMany({ where: { ...scope, date: { in: dates } } });
        await tx.searchAnalyticsDaily.createMany({
          data: part.map((day) => ({
            ...scope,
            clicks: day.clicks,
            ctr: day.ctr,
            date: dateFromKey(day.date),
            fetchedAt,
            impressions: day.impressions,
            position: day.position,
          })),
          skipDuplicates: true,
        });
        await tx.searchAnalyticsSyncPartition.deleteMany({
          where: {
            ...scope,
            dataState: AGGREGATE_DATA_STATE,
            date: { in: dates },
            dimensions: AGGREGATE_DIMENSIONS,
            source: SEARCH_INSIGHTS_SOURCE,
          },
        });
        await tx.searchAnalyticsSyncPartition.createMany({
          // One day asked for, one day returned: the aggregate request is never capped.
          data: part.map((day) => ({
            ...scope,
            capHit: false,
            dataState: AGGREGATE_DATA_STATE,
            date: dateFromKey(day.date),
            dimensions: AGGREGATE_DIMENSIONS,
            durationMs,
            fetchedAt,
            pages: 1,
            requestedRows: 1,
            returnedRows: 1,
            source: SEARCH_INSIGHTS_SOURCE,
          })),
          skipDuplicates: true,
        });
      },
      { timeout: AGGREGATE_TRANSACTION_TIMEOUT_MS },
    );
  }

  if (requestAttemptId) {
    await prisma.searchAnalyticsRequestUsage.update({
      data: { persistedAt: new Date() },
      where: { id: requestAttemptId },
    });
  }
  return { days: days.length };
}
