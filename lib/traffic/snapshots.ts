import "server-only";

import { prisma } from "@/lib/db/prisma";
import { GSC_QUERY_STATS_ROW_CAP } from "@/lib/providers/analytics/gsc-query-pagination";
import type { AnalyticsProvider, ProviderCredentials } from "@/lib/providers/types";
import {
  keywordsByText,
  matchingKeywords,
  matchingPageRows,
  pageCandidatePaths,
  type TrafficKeyword,
} from "./match";

export { PAGE_STATS_LAG_DAYS, QUERY_STATS_LAG_DAYS } from "./constants";

const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_RETENTION_DAYS = 180;

export const QUERY_STATS_WINDOW_DAYS = [DEFAULT_WINDOW_DAYS, 7] as const;

export type QueryStatsProvider = AnalyticsProvider & {
  fetchQueryStats: NonNullable<AnalyticsProvider["fetchQueryStats"]>;
};
export type PageStatsProvider = AnalyticsProvider & {
  fetchPageStats: NonNullable<AnalyticsProvider["fetchPageStats"]>;
};

export type TrafficPruneSummary = {
  cutoff: string;
  keywordSnapshots: number;
  pageSnapshots: number;
  retentionDays: number;
};

export type TrafficSnapshotSyncMetrics = {
  rowsFetched: number;
  rowsMatched: number;
  rowsUpserted: number;
  truncated: boolean;
};

export function hasQueryStats(provider: AnalyticsProvider): provider is QueryStatsProvider {
  return typeof provider.fetchQueryStats === "function";
}

export function hasPageStats(provider: AnalyticsProvider): provider is PageStatsProvider {
  return typeof provider.fetchPageStats === "function";
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function statsWindow(now: Date, lagDays: number, windowDays = DEFAULT_WINDOW_DAYS) {
  const snapshotDate = addUtcDays(utcDateOnly(now), -lagDays);
  const startDate = addUtcDays(snapshotDate, -(windowDays - 1));
  return {
    endDate: dateString(snapshotDate),
    snapshotDate,
    startDate: dateString(startDate),
    windowDays,
  };
}

function retentionDays() {
  const value = Number.parseInt(process.env.TRAFFIC_SNAPSHOT_RETENTION_DAYS ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_RETENTION_DAYS;
}

export async function upsertQuerySnapshots(
  provider: string,
  credentials: ProviderCredentials,
  analytics: QueryStatsProvider,
  keywords: TrafficKeyword[],
  window: ReturnType<typeof statsWindow>,
) {
  const rows = await analytics.fetchQueryStats(credentials, {
    endDate: window.endDate,
    startDate: window.startDate,
  });
  const byText = keywordsByText(keywords);
  let rowsMatched = 0;
  let rowsUpserted = 0;

  for (const row of rows) {
    const matchedKeywords = matchingKeywords(row, byText);
    if (matchedKeywords.length > 0) rowsMatched += 1;

    for (const keyword of matchedKeywords) {
      await prisma.keywordTrafficSnapshot.upsert({
        create: {
          clicks: row.clicks,
          ctr: row.ctr,
          date: window.snapshotDate,
          impressions: row.impressions,
          keywordId: keyword.id,
          position: row.position,
          provider,
          windowDays: window.windowDays,
        },
        update: {
          clicks: row.clicks,
          ctr: row.ctr,
          impressions: row.impressions,
          position: row.position,
        },
        where: {
          keywordId_provider_date_windowDays: {
            date: window.snapshotDate,
            keywordId: keyword.id,
            provider,
            windowDays: window.windowDays,
          },
        },
      });
      rowsUpserted += 1;
    }
  }

  return {
    rowsFetched: rows.length,
    rowsMatched,
    rowsUpserted,
    truncated: provider === "gsc" && rows.length >= GSC_QUERY_STATS_ROW_CAP,
  };
}

export async function upsertPageSnapshots(
  projectId: string,
  provider: string,
  credentials: ProviderCredentials,
  analytics: PageStatsProvider,
  keywords: TrafficKeyword[],
  window: ReturnType<typeof statsWindow>,
) {
  const rows = await analytics.fetchPageStats(credentials, {
    endDate: window.endDate,
    startDate: window.startDate,
  });
  const candidates = pageCandidatePaths(keywords);
  const matchedRows = matchingPageRows(rows, candidates);
  let rowsUpserted = 0;

  for (const row of matchedRows) {
    await prisma.pageTrafficSnapshot.upsert({
      create: {
        bounceRate: row.bounceRate,
        date: window.snapshotDate,
        engagementRate: row.engagementRate,
        keyEvents: row.keyEvents,
        path: row.normalizedPath,
        projectId,
        provider,
        scrollDepth: row.scrollDepth,
        sessions: row.sessions,
        visitDurationSeconds: row.visitDurationSeconds,
        visitors: row.visitors,
        windowDays: window.windowDays,
      },
      update: {
        bounceRate: row.bounceRate,
        engagementRate: row.engagementRate,
        keyEvents: row.keyEvents,
        scrollDepth: row.scrollDepth,
        sessions: row.sessions,
        visitDurationSeconds: row.visitDurationSeconds,
        visitors: row.visitors,
      },
      where: {
        projectId_provider_path_date_windowDays: {
          date: window.snapshotDate,
          path: row.normalizedPath,
          projectId,
          provider,
          windowDays: window.windowDays,
        },
      },
    });
    rowsUpserted += 1;
  }

  return {
    rowsFetched: rows.length,
    rowsMatched: matchedRows.length,
    rowsUpserted,
    truncated: false,
  };
}

export async function pruneTrafficSnapshots(now: Date): Promise<TrafficPruneSummary> {
  const days = retentionDays();
  const cutoffDate = addUtcDays(utcDateOnly(now), -days);
  const [keywordSnapshots, pageSnapshots] = await Promise.all([
    prisma.keywordTrafficSnapshot.deleteMany({ where: { date: { lt: cutoffDate } } }),
    prisma.pageTrafficSnapshot.deleteMany({ where: { date: { lt: cutoffDate } } }),
  ]);

  return {
    cutoff: dateString(cutoffDate),
    keywordSnapshots: keywordSnapshots.count,
    pageSnapshots: pageSnapshots.count,
    retentionDays: days,
  };
}
