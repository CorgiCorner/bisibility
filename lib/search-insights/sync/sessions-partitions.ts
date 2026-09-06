import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  type DailyOrganicSessionsPagesResult,
  fetchDailyOrganicSessionsByLandingPage,
  fetchDailyOrganicSessionsTotals,
} from "@/lib/providers/analytics/ga4-organic";
import type { ProviderCredentials } from "@/lib/providers/types";
import { addDays, dateFromKey } from "@/lib/search-insights/dates";
import { normalizeLandingPath } from "@/lib/search-insights/join";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { recordPartitionProvenance } from "./partitions";
import { ORGANIC_SESSIONS_SOURCE } from "./sessions-credentials";

const DATA_STATE = "final";
const TOTAL_DIMENSIONS = "date";
const PAGE_DIMENSIONS = "date,landingPage";
const WRITE_TIMEOUT_MS = 120_000;

export const ORGANIC_SESSIONS_SETTLING_LAG_DAYS = 1;

type DailyTotal = { date: string; sessions: number };
type DailyPage = DailyTotal & {
  engagedSessions: number | null;
  keyEvents: number | null;
  path: string;
};
type PageRequestProvenance = Pick<
  DailyOrganicSessionsPagesResult,
  "capHit" | "pages" | "requestedRows"
>;

function rangeDays(start: string, end: string) {
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
}

function mergeNullableMetric(existing: number | null, contribution: number | null) {
  if (existing === null || contribution === null) return null;
  return existing + contribution;
}

function pagesByDate(rows: DailyOrganicSessionsPagesResult["rows"]) {
  const grouped = new Map<string, Map<string, DailyPage>>();
  for (const row of rows) {
    const values = grouped.get(row.date) ?? new Map<string, DailyPage>();
    const path = normalizeLandingPath(row.landingPage);
    const existing = values.get(path);
    values.set(path, {
      date: row.date,
      engagedSessions: existing
        ? mergeNullableMetric(existing.engagedSessions, row.engagedSessions)
        : row.engagedSessions,
      keyEvents: existing ? mergeNullableMetric(existing.keyEvents, row.keyEvents) : row.keyEvents,
      path,
      sessions: (existing?.sessions ?? 0) + row.sessions,
    });
    grouped.set(row.date, values);
  }
  return new Map([...grouped].map(([date, pages]) => [date, [...pages.values()]]));
}

function totalsByDate(rows: Awaited<ReturnType<typeof fetchDailyOrganicSessionsTotals>>) {
  return new Map(rows.map((row) => [row.date, row.sessions]));
}

async function writeDay(
  tx: Prisma.TransactionClient,
  input: {
    date: string;
    pages: readonly DailyPage[];
    projectId: string;
    property: string;
    sessions: number | null;
    fetchedAt: Date;
    pageCapHit: boolean;
    pageRequest: PageRequestProvenance;
    durationMs: number;
  },
) {
  const scope = { date: input.date, projectId: input.projectId, property: input.property };
  const date = dateFromKey(input.date);
  if (input.pages.length === 0) {
    const existingPages = await tx.organicSessionsPageDaily.count({
      where: { date, projectId: input.projectId, property: input.property },
    });
    if (existingPages > 0) return;
  }
  await tx.organicSessionsDaily.deleteMany({
    where: { date, projectId: input.projectId, property: input.property },
  });
  if (input.sessions !== null) {
    await tx.organicSessionsDaily.create({
      data: {
        date,
        fetchedAt: input.fetchedAt,
        projectId: input.projectId,
        property: input.property,
        sessions: input.sessions,
      },
    });
  }
  await tx.organicSessionsPageDaily.deleteMany({
    where: { date, projectId: input.projectId, property: input.property },
  });
  if (input.pages.length > 0) {
    await tx.organicSessionsPageDaily.createMany({
      data: input.pages.map((row) => ({
        date,
        fetchedAt: input.fetchedAt,
        keyHash: dimensionKeyHash([row.path]),
        path: row.path,
        projectId: input.projectId,
        property: input.property,
        sessions: row.sessions,
        engagedSessions: row.engagedSessions,
        keyEvents: row.keyEvents,
      })),
      skipDuplicates: true,
    });
  }
  // The provider exposes no finalization signal, so final means the report exactly as returned.
  await recordPartitionProvenance(tx, {
    dataState: DATA_STATE,
    dimensions: TOTAL_DIMENSIONS,
    durationMs: input.durationMs,
    fetchedAt: input.fetchedAt,
    provenance: {
      capHit: false,
      pages: 1,
      requestedRows: 1,
      returnedRows: input.sessions === null ? 0 : 1,
    },
    scope,
    source: ORGANIC_SESSIONS_SOURCE,
  });
  // The provider returns one range report, so every covered day retains its request size provenance.
  await recordPartitionProvenance(tx, {
    dataState: DATA_STATE,
    dimensions: PAGE_DIMENSIONS,
    durationMs: input.durationMs,
    fetchedAt: input.fetchedAt,
    provenance: {
      capHit: input.pageCapHit,
      pages: input.pageRequest.pages,
      requestedRows: input.pageRequest.requestedRows,
      returnedRows: input.pages.length,
    },
    scope,
    source: ORGANIC_SESSIONS_SOURCE,
  });
}

/** A range request is authoritative through the last date its landing-page rows actually cover. */
export async function syncOrganicSessionsRange(input: {
  credentials: ProviderCredentials;
  end: string;
  projectId: string;
  property: string;
  start: string;
}) {
  const totals = await fetchDailyOrganicSessionsTotals({
    credentials: input.credentials,
    endDate: input.end,
    startDate: input.start,
  });
  const totalMap = totalsByDate(totals);
  const maxIterations = rangeDays(input.start, input.end).length;
  let capHit = false;
  let cursor = input.start;
  let iterations = 0;

  while (cursor <= input.end && iterations < maxIterations) {
    const startedAt = Date.now();
    const pageReport = await fetchDailyOrganicSessionsByLandingPage({
      credentials: input.credentials,
      endDate: input.end,
      startDate: cursor,
    });
    const fetchedAt = new Date();
    const durationMs = Date.now() - startedAt;
    const { rows: pageRows, ...pageRequest } = pageReport;
    const pageMap = pagesByDate(pageRows);
    const returnedDates = [...pageMap.keys()]
      .filter((date) => date >= cursor && date <= input.end)
      .sort();
    const lastReturnedDate = returnedDates.at(-1);
    capHit = capHit || pageRequest.capHit;
    let coveredThrough = input.end;
    if (pageRequest.capHit) {
      if (!lastReturnedDate) break;
      coveredThrough = lastReturnedDate > cursor ? addDays(lastReturnedDate, -1) : lastReturnedDate;
    }

    for (const date of rangeDays(cursor, coveredThrough)) {
      const pages = pageMap.get(date) ?? [];
      await prisma.$transaction(
        async (tx) => {
          await writeDay(tx, {
            date,
            durationMs,
            fetchedAt,
            pageCapHit: pageRequest.capHit && date === lastReturnedDate,
            pageRequest,
            pages,
            projectId: input.projectId,
            property: input.property,
            sessions: totalMap.get(date) ?? null,
          });
        },
        { timeout: WRITE_TIMEOUT_MS },
      );
    }
    cursor = addDays(coveredThrough, 1);
    iterations += 1;
  }

  return { capHit };
}
