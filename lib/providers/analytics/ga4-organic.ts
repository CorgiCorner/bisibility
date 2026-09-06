import type { ProviderCredentials } from "@/lib/providers/types";
import { GA4_ORGANIC_SEARCH_FILTER, type Ga4Row, ga4AnalyticsProvider } from "./ga4";

export const ORGANIC_SESSIONS_PAGE_SIZE = 25_000;
const ORGANIC_SESSIONS_MAX_ROWS = 100_000;

export type DailyOrganicSessions = { date: string; sessions: number };
export type DailyOrganicSessionsPage = DailyOrganicSessions & {
  engagedSessions: number | null;
  keyEvents: number | null;
  landingPage: string;
};
export type DailyOrganicSessionsPagesResult = {
  capHit: boolean;
  pages: number;
  requestedRows: number;
  rows: DailyOrganicSessionsPage[];
};

function dateKey(value: string | undefined) {
  if (!value || !/^\d{8}$/u.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function sessions(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableMetric(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pageRow(row: Ga4Row): DailyOrganicSessionsPage | null {
  const date = dateKey(row.dimensionValues?.[0]?.value);
  const landingPage = row.dimensionValues?.[1]?.value?.trim();
  if (!date || !landingPage || landingPage === "(not set)") return null;
  // Metric order is load-bearing: sessions, engagedSessions, keyEvents.
  return {
    date,
    engagedSessions: nullableMetric(row.metricValues?.[1]?.value),
    keyEvents: nullableMetric(row.metricValues?.[2]?.value),
    landingPage,
    sessions: sessions(row.metricValues?.[0]?.value),
  };
}

function totalRow(row: Ga4Row): DailyOrganicSessions | null {
  const date = dateKey(row.dimensionValues?.[0]?.value);
  return date ? { date, sessions: sessions(row.metricValues?.[0]?.value) } : null;
}

export async function fetchDailyOrganicSessionsByLandingPage(input: {
  credentials: ProviderCredentials;
  endDate: string;
  limit?: number;
  offset?: number;
  startDate: string;
}): Promise<DailyOrganicSessionsPagesResult> {
  const limit = Math.max(
    1,
    Math.min(input.limit ?? ORGANIC_SESSIONS_PAGE_SIZE, ORGANIC_SESSIONS_PAGE_SIZE),
  );
  const rows: DailyOrganicSessionsPage[] = [];
  let offset = Math.max(0, input.offset ?? 0);
  let pages = 0;
  let requestedRows = 0;

  while (offset < ORGANIC_SESSIONS_MAX_ROWS) {
    const pageLimit = Math.min(limit, ORGANIC_SESSIONS_MAX_ROWS - offset);
    const page = await ga4AnalyticsProvider.fetchReport({
      credentials: input.credentials,
      dimensionFilter: GA4_ORGANIC_SEARCH_FILTER,
      dimensions: ["date", "landingPage"],
      endDate: input.endDate,
      limit: pageLimit,
      metrics: ["sessions", "engagedSessions", "keyEvents"],
      offset,
      orderBys: [{ dimension: { dimensionName: "date" } }],
      startDate: input.startDate,
    });
    pages += 1;
    requestedRows += pageLimit;
    const consumed = page.slice(0, pageLimit);
    rows.push(
      ...consumed.flatMap((row) => {
        const value = pageRow(row);
        return value ? [value] : [];
      }),
    );
    if (page.length < pageLimit) break;
    offset += pageLimit;
  }

  return {
    capHit: pages > 0 && offset >= ORGANIC_SESSIONS_MAX_ROWS,
    pages,
    requestedRows,
    rows,
  };
}

export async function fetchDailyOrganicSessionsTotals(input: {
  credentials: ProviderCredentials;
  endDate: string;
  startDate: string;
}): Promise<DailyOrganicSessions[]> {
  const rows = await ga4AnalyticsProvider.fetchReport({
    credentials: input.credentials,
    dimensionFilter: GA4_ORGANIC_SEARCH_FILTER,
    dimensions: ["date"],
    endDate: input.endDate,
    metrics: ["sessions"],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    startDate: input.startDate,
  });
  return rows.flatMap((row) => {
    const value = totalRow(row);
    return value ? [value] : [];
  });
}
