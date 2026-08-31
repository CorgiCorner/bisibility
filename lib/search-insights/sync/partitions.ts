import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  GscRow,
  GscSearchAnalyticsSession,
} from "@/lib/providers/analytics/gsc-search-analytics";
import {
  DAILY_ROW_CEILING,
  SEARCH_ANALYTICS_ROW_LIMIT,
  SEARCH_INSIGHTS_SEARCH_TYPE,
} from "@/lib/search-insights/constants";
import { type DateWindow, dateFromKey } from "@/lib/search-insights/dates";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { formatPartitionStored, logSyncInfo } from "./activity-log";
import { assertRequestedProperty, SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { accountSearchAnalyticsRequests } from "./request-usage";
import { chunk, numberValue } from "./rows";

const WRITE_CHUNK_SIZE = 1_000;
const PARTITION_TRANSACTION_TIMEOUT_MS = 120_000;
export type PartitionDimensions =
  | readonly ["page"]
  | readonly ["query"]
  | readonly ["query", "page"];
export type PartitionProvenance = {
  capHit: boolean;
  pages: number;
  requestedRows: number;
  returnedRows: number;
};
export type SyncedPartition = PartitionProvenance & { storedRows: number };
export type PartitionScope = {
  date: string;
  projectId: string;
  property: string;
};
export type DayPartition = {
  provenance: PartitionProvenance;
  rows: GscRow[];
};
function metricColumns(row: GscRow, fetchedAt: Date) {
  return {
    clicks: numberValue(row.clicks),
    ctr: numberValue(row.ctr),
    fetchedAt,
    impressions: numberValue(row.impressions),
    position: numberValue(row.position),
  };
}
function partitionColumns(scope: PartitionScope) {
  return {
    date: dateFromKey(scope.date),
    projectId: scope.projectId,
    property: scope.property,
    searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
  };
}
export async function fetchDayPartition(input: {
  date: string;
  dimensions: PartitionDimensions;
  session: GscSearchAnalyticsSession;
}): Promise<DayPartition> {
  const rows: GscRow[] = [];
  let pages = 0;
  let lastPageFull = false;
  while (rows.length < DAILY_ROW_CEILING) {
    const envelope = await input.session.fetchEnvelope({
      dataState: "final",
      dimensions: [...input.dimensions],
      endDate: input.date,
      rowLimit: SEARCH_ANALYTICS_ROW_LIMIT,
      startRow: rows.length,
      startDate: input.date,
      type: SEARCH_INSIGHTS_SEARCH_TYPE,
    });
    pages += 1;
    rows.push(...envelope.rows);
    lastPageFull = envelope.rows.length >= SEARCH_ANALYTICS_ROW_LIMIT;
    if (!lastPageFull) break;
  }
  return {
    provenance: {
      capHit: lastPageFull || rows.length >= DAILY_ROW_CEILING,
      pages,
      requestedRows: pages * SEARCH_ANALYTICS_ROW_LIMIT,
      returnedRows: rows.length,
    },
    rows,
  };
}
// re-fetch of the same day is authoritative, and the provider drops rows between fetches,
// so merging would leave rows the provider no longer reports.
function writePartitionRows(
  scope: PartitionScope,
  dimensions: PartitionDimensions,
  rows: readonly GscRow[],
  fetchedAt: Date,
) {
  const where = partitionColumns(scope);
  if (dimensions[0] === "page") {
    const pageRows = rows.flatMap((row) => {
      const page = row.keys[0]?.trim();
      if (!page) return [];
      return [
        { ...where, ...metricColumns(row, fetchedAt), keyHash: dimensionKeyHash([page]), page },
      ];
    });
    return async (tx: Prisma.TransactionClient) => {
      await tx.searchAnalyticsPageDaily.deleteMany({ where });
      for (const part of chunk(pageRows, WRITE_CHUNK_SIZE)) {
        await tx.searchAnalyticsPageDaily.createMany({ data: part, skipDuplicates: true });
      }
    };
  }

  if (dimensions.length === 1) {
    const queryRows = rows.flatMap((row) => {
      const query = row.keys[0]?.trim();
      if (!query) return [];
      return [
        { ...where, ...metricColumns(row, fetchedAt), keyHash: dimensionKeyHash([query]), query },
      ];
    });
    return async (tx: Prisma.TransactionClient) => {
      await tx.searchAnalyticsQueryDaily.deleteMany({ where });
      for (const part of chunk(queryRows, WRITE_CHUNK_SIZE)) {
        await tx.searchAnalyticsQueryDaily.createMany({ data: part, skipDuplicates: true });
      }
    };
  }

  const queryPageRows = rows.flatMap((row) => {
    const query = row.keys[0]?.trim();
    const page = row.keys[1]?.trim();
    if (!query || !page) return [];
    return [
      {
        ...where,
        ...metricColumns(row, fetchedAt),
        keyHash: dimensionKeyHash([query, page]),
        page,
        query,
      },
    ];
  });
  return async (tx: Prisma.TransactionClient) => {
    await tx.searchAnalyticsQueryPageDaily.deleteMany({ where });
    for (const part of chunk(queryPageRows, WRITE_CHUNK_SIZE)) {
      await tx.searchAnalyticsQueryPageDaily.createMany({ data: part, skipDuplicates: true });
    }
  };
}

export function recordPartitionProvenance(
  tx: Prisma.TransactionClient,
  input: {
    dataState: "all" | "final";
    dimensions: string;
    durationMs?: number;
    fetchedAt: Date;
    provenance: PartitionProvenance;
    scope: PartitionScope;
    source?: "ga4" | "gsc";
  },
) {
  const columns = partitionColumns(input.scope);
  const values = {
    capHit: input.provenance.capHit,
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    fetchedAt: input.fetchedAt,
    pages: input.provenance.pages,
    requestedRows: input.provenance.requestedRows,
    returnedRows: input.provenance.returnedRows,
  };
  const source = input.source ?? SEARCH_INSIGHTS_SOURCE;
  return tx.searchAnalyticsSyncPartition.upsert({
    create: {
      ...columns,
      ...values,
      dataState: input.dataState,
      dimensions: input.dimensions,
      source,
    },
    update: values,
    where: {
      projectId_property_source_searchType_date_dimensions_dataState: {
        dataState: input.dataState,
        date: columns.date,
        dimensions: input.dimensions,
        projectId: columns.projectId,
        property: columns.property,
        searchType: columns.searchType,
        source,
      },
    },
  });
}

// Rows and their provenance land together: a stored partition always says what was
// asked for and what came back.
export async function syncDayPartition(input: {
  date: string;
  dimensions: PartitionDimensions;
  projectId: string;
  property: string;
  session: GscSearchAnalyticsSession;
}): Promise<SyncedPartition> {
  assertRequestedProperty(input.session.property, input.property);
  const startedAt = Date.now();
  const session = accountSearchAnalyticsRequests({
    operation: "dimensional",
    projectId: input.projectId,
    property: input.property,
    session: input.session,
  });
  const partition = await fetchDayPartition({
    date: input.date,
    dimensions: input.dimensions,
    session,
  });
  const fetchedAt = new Date();
  const scope = { date: input.date, projectId: input.projectId, property: input.property };
  const writeRows = writePartitionRows(scope, input.dimensions, partition.rows, fetchedAt);
  const storedRows = await prisma.$transaction(
    async (tx) => {
      await writeRows(tx);
      await recordPartitionProvenance(tx, {
        dataState: "final",
        dimensions: input.dimensions.join(","),
        durationMs: Date.now() - startedAt,
        fetchedAt,
        provenance: partition.provenance,
        scope,
      });
      const where = partitionColumns(scope);
      if (input.dimensions[0] === "page") return tx.searchAnalyticsPageDaily.count({ where });
      if (input.dimensions.length === 1) return tx.searchAnalyticsQueryDaily.count({ where });
      return tx.searchAnalyticsQueryPageDaily.count({ where });
    },
    { timeout: PARTITION_TRANSACTION_TIMEOUT_MS },
  );

  const result = { ...partition.provenance, storedRows };
  logSyncInfo(
    formatPartitionStored({ date: input.date, dimensions: input.dimensions, storedRows }),
  );
  return result;
}

/**
 * The count of truncated days, derived from the stored partitions and never incremented: the
 * same day can be fetched more than once (the backfill re-fetches the newest day the scheduled
 * sweep already stored), and a counter would report more capped days than exist. The window and
 * the request sets are optional so the sweep's whole-property count and the coverage sentence's
 * windowed, dimensional one stay one selection instead of two predicates kept in step by hand.
 */
export async function countCappedDays(input: {
  dimensions?: readonly string[];
  projectId: string;
  property: string;
  source?: "ga4" | "gsc";
  window?: DateWindow;
}) {
  const days = await prisma.searchAnalyticsSyncPartition.groupBy({
    by: ["date"],
    where: {
      capHit: true,
      ...(input.window
        ? { date: { gte: dateFromKey(input.window.start), lte: dateFromKey(input.window.end) } }
        : {}),
      ...(input.dimensions ? { dimensions: { in: [...input.dimensions] } } : {}),
      projectId: input.projectId,
      property: input.property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      source: input.source ?? SEARCH_INSIGHTS_SOURCE,
    },
  });
  return days.length;
}

export const PARTITION_DIMENSION_SETS: readonly PartitionDimensions[] = [
  ["query"],
  ["page"],
  ["query", "page"],
];

export const PARTITION_DIMENSION_KEYS: readonly string[] = PARTITION_DIMENSION_SETS.map((set) =>
  set.join(","),
);
