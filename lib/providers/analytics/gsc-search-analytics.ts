import { providerAccountKey } from "@/lib/providers/rate-limit";
import type { AnalyticsQueryStatsInput, ProviderCredentials } from "@/lib/providers/types";
import { type GoogleFetchContext, googleApiFetch, refreshGoogleAccessToken } from "./google-client";
import { readGscCredentials } from "./gsc-credentials";
import { gscDimensionFilterGroups } from "./gsc-query-pagination";

// Search Console never mixes surfaces in one response, so a request names exactly one.
export type GscSearchType = "discover" | "googleNews" | "image" | "news" | "video" | "web";

// "final" returns only days Google considers settled; "all" adds the fresh tail and
// the metadata naming the first day that is still incomplete.
export type GscDataState = "all" | "final";

export type GscQueryInput = {
  credentials: ProviderCredentials;
  dataState?: GscDataState;
  dimensions?: string[];
  endDate: string;
  pagePath?: AnalyticsQueryStatsInput["pagePath"];
  query?: string;
  rowLimit?: number;
  startRow?: number;
  startDate: string;
  type?: GscSearchType;
};

export type GscRow = {
  clicks: number;
  ctr: number;
  impressions: number;
  keys: string[];
  position: number;
};

export type GscSearchAnalyticsMetadata = {
  firstIncompleteDate?: string;
  firstIncompleteHour?: string;
};

export type GscSearchAnalyticsEnvelope = {
  metadata?: GscSearchAnalyticsMetadata;
  responseAggregationType?: string;
  rows: GscRow[];
};

// The request shape without credentials: a session already holds them, and the site it
// queries, for every call it makes.
export type GscSearchAnalyticsQuery = Omit<GscQueryInput, "credentials">;

export type GscSearchAnalyticsSession = {
  fetchEnvelope(query: GscSearchAnalyticsQuery): Promise<GscSearchAnalyticsEnvelope>;
  property: string;
};

type GscSearchAnalyticsResponse = {
  metadata?: {
    firstIncompleteDate?: unknown;
    firstIncompleteHour?: unknown;
    first_incomplete_date?: unknown;
    first_incomplete_hour?: unknown;
  };
  responseAggregationType?: unknown;
  rows?: GscRow[];
};

// Rate-limit account is the Google account (refresh token) scoped to the property,
// matching the per-user and per-property quotas Search Console enforces.
export function gscFetchContext(creds: ProviderCredentials, property: string): GoogleFetchContext {
  return {
    accountKey: providerAccountKey("gsc", { apiKey: creds.apiKey, login: property }),
    providerId: "gsc",
  };
}

function gscQueryUrl(property: string) {
  return `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/searchAnalytics/query`;
}

// An empty `dimensions` array is a real request shape - it asks for the aggregate
// totals row - so it reaches the body untouched instead of falling back to a default.
function searchAnalyticsBody(input: GscSearchAnalyticsQuery) {
  return {
    ...(input.dataState ? { dataState: input.dataState } : {}),
    dimensions: input.dimensions ?? ["query"],
    endDate: input.endDate,
    ...gscDimensionFilterGroups(input),
    rowLimit: input.rowLimit ?? 100,
    ...(input.startRow === undefined ? {} : { startRow: input.startRow }),
    startDate: input.startDate,
    ...(input.type ? { type: input.type } : {}),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Google spells the freshness fields snake_case inside `metadata`; the camelCase
// spelling is accepted too so a response rename cannot silently drop freshness.
function readMetadata(
  response: GscSearchAnalyticsResponse,
): GscSearchAnalyticsMetadata | undefined {
  const raw = response.metadata;
  if (!raw) return undefined;
  const firstIncompleteDate = stringValue(raw.first_incomplete_date ?? raw.firstIncompleteDate);
  const firstIncompleteHour = stringValue(raw.first_incomplete_hour ?? raw.firstIncompleteHour);
  if (!firstIncompleteDate && !firstIncompleteHour) return undefined;
  return {
    ...(firstIncompleteDate ? { firstIncompleteDate } : {}),
    ...(firstIncompleteHour ? { firstIncompleteHour } : {}),
  };
}

// Returns the whole response, not just rows: provenance needs the returned row count
// and freshness needs the metadata Google only sends alongside the rows.
async function requestEnvelope(
  credentials: ProviderCredentials,
  property: string,
  accessToken: string,
  query: GscSearchAnalyticsQuery,
): Promise<GscSearchAnalyticsEnvelope> {
  const data = await googleApiFetch<GscSearchAnalyticsResponse>(
    gscQueryUrl(property),
    accessToken,
    { body: JSON.stringify(searchAnalyticsBody(query)), method: "POST" },
    gscFetchContext(credentials, property),
  );
  const metadata = readMetadata(data);
  return {
    ...(metadata ? { metadata } : {}),
    ...(typeof data.responseAggregationType === "string"
      ? { responseAggregationType: data.responseAggregationType }
      : {}),
    rows: data.rows ?? [],
  };
}

// One access token for a whole batch. A refresh is a separate POST to the token endpoint,
// which the provider rate-limit gate does not cover, so refreshing per request would double
// every round trip and leave that half ungoverned; an issued token outlives any batch.
export async function createGscSearchAnalyticsSession(
  credentials: ProviderCredentials,
): Promise<GscSearchAnalyticsSession> {
  const { property, refreshToken } = readGscCredentials(credentials);
  const accessToken = await refreshGoogleAccessToken(refreshToken, credentials.onRefreshToken);
  return {
    fetchEnvelope: (query) => requestEnvelope(credentials, property, accessToken, query),
    property,
  };
}

// The single-shot form, for callers that make one request and have no batch to amortize
// a refresh over.
export async function fetchSearchAnalyticsEnvelope(
  input: GscQueryInput,
): Promise<GscSearchAnalyticsEnvelope> {
  const { property, refreshToken } = readGscCredentials(input.credentials);
  const accessToken = await refreshGoogleAccessToken(
    refreshToken,
    input.credentials.onRefreshToken,
  );
  return requestEnvelope(input.credentials, property, accessToken, input);
}

export async function fetchSearchAnalyticsRows(input: GscQueryInput): Promise<GscRow[]> {
  return (await fetchSearchAnalyticsEnvelope(input)).rows;
}
