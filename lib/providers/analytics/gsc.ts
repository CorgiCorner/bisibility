import { providerAccountKey } from "@/lib/providers/rate-limit";
import type {
  AnalyticsProvider,
  AnalyticsQueryStatsInput,
  AnalyticsTopQuery,
  ProviderCredentials,
  ProviderTestResult,
  QueryStatRow,
} from "@/lib/providers/types";
import {
  type GoogleFetchContext,
  googleApiFetch,
  listGoogleSites,
  refreshGoogleAccessToken,
} from "./google-client";
import { readGscCredentials as readCredentials } from "./gsc-credentials";
import {
  createGscUrlInspectionSession,
  type GscUrlInspectionInput,
  type GscUrlInspectionResult,
  type GscUrlInspectionSession,
} from "./gsc-inspection";
import {
  fetchGscQueryStats,
  filterGscQueryStats,
  gscDimensionFilterGroups,
} from "./gsc-query-pagination";

export type {
  GscUrlInspectionInput,
  GscUrlInspectionResult,
  GscUrlInspectionSession,
} from "./gsc-inspection";

// Rate-limit account is the Google account (refresh token) scoped to the property,
// matching the per-user and per-property quotas Search Console enforces.
function fetchContext(creds: ProviderCredentials, property: string): GoogleFetchContext {
  return {
    accountKey: providerAccountKey("gsc", { apiKey: creds.apiKey, login: property }),
    providerId: "gsc",
  };
}

export type GscQueryInput = {
  credentials: ProviderCredentials;
  dimensions?: string[];
  endDate: string;
  pagePath?: AnalyticsQueryStatsInput["pagePath"];
  query?: string;
  rowLimit?: number;
  startRow?: number;
  startDate: string;
};

export type GscRow = {
  clicks: number;
  ctr: number;
  impressions: number;
  keys: string[];
  position: number;
};

function queryUrl(property: string) {
  return `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/searchAnalytics/query`;
}

function sitemapUrl(property: string, feedpath: string) {
  return `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/sitemaps/${encodeURIComponent(feedpath)}`;
}

// Subset of the WmxSitemap resource returned by sitemaps.get - enough to report
// whether GSC could parse the feed and surface any per-feed errors/warnings.
export type GscSitemapStatus = {
  contents: Array<{ submitted: number; type: string }>;
  errors: number;
  isPending: boolean;
  isSitemapsIndex: boolean;
  lastDownloaded: string | null;
  lastSubmitted: string | null;
  path: string;
  warnings: number;
};

type WmxSitemap = {
  contents?: Array<{ submitted?: unknown; type?: unknown }>;
  errors?: unknown;
  isPending?: unknown;
  isSitemapsIndex?: unknown;
  lastDownloaded?: unknown;
  lastSubmitted?: unknown;
  path?: unknown;
  warnings?: unknown;
};

function numberValue(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function dateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function last28DaysRange(now = new Date()) {
  const end = utcDateOnly(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);

  return { endDate: dateParam(end), startDate: dateParam(start) };
}

function topQueryFromRow(row: GscRow): AnalyticsTopQuery | null {
  const query = row.keys[0]?.trim();
  if (!query) return null;
  return {
    clicks: numberValue(row.clicks),
    impressions: numberValue(row.impressions),
    query,
  };
}

function queryStatFromRow(row: GscRow, includePage = false): QueryStatRow | null {
  const query = row.keys[0]?.trim();
  if (!query) return null;
  const page = includePage ? row.keys[1]?.trim() : undefined;
  return {
    clicks: numberValue(row.clicks),
    ctr: numberValue(row.ctr),
    impressions: numberValue(row.impressions),
    position: numberValue(row.position),
    query,
    ...(page ? { page } : {}),
  };
}

async function fetchSearchAnalytics(input: GscQueryInput): Promise<GscRow[]> {
  const { property, refreshToken } = readCredentials(input.credentials);
  const accessToken = await refreshGoogleAccessToken(
    refreshToken,
    input.credentials.onRefreshToken,
  );
  const data = await googleApiFetch<{ rows?: GscRow[] }>(
    queryUrl(property),
    accessToken,
    {
      body: JSON.stringify({
        dimensions: input.dimensions ?? ["query"],
        endDate: input.endDate,
        ...gscDimensionFilterGroups(input),
        rowLimit: input.rowLimit ?? 100,
        ...(input.startRow === undefined ? {} : { startRow: input.startRow }),
        startDate: input.startDate,
      }),
      method: "POST",
    },
    fetchContext(input.credentials, property),
  );
  return data.rows ?? [];
}

export type GscAnalyticsProvider = AnalyticsProvider & {
  createUrlInspectionSession(creds: ProviderCredentials): Promise<GscUrlInspectionSession>;
  fetchSearchAnalytics(input: GscQueryInput): Promise<GscRow[]>;
  fetchTopQueries(
    credentials: ProviderCredentials,
    input: { limit: number },
  ): Promise<AnalyticsTopQuery[]>;
  fetchQueryStats(
    credentials: ProviderCredentials,
    input: AnalyticsQueryStatsInput,
  ): Promise<QueryStatRow[]>;
  getSitemapStatus(creds: ProviderCredentials, feedpath: string): Promise<GscSitemapStatus>;
  inspectUrl(
    creds: ProviderCredentials,
    input: GscUrlInspectionInput,
  ): Promise<GscUrlInspectionResult>;
};

export const gscAnalyticsProvider: GscAnalyticsProvider = {
  id: "gsc",
  label: "Google Search Console",

  async createUrlInspectionSession(creds: ProviderCredentials): Promise<GscUrlInspectionSession> {
    return createGscUrlInspectionSession(creds);
  },

  async testConnection(creds: ProviderCredentials): Promise<ProviderTestResult> {
    try {
      const { property, refreshToken } = readCredentials(creds);
      const accessToken = await refreshGoogleAccessToken(refreshToken, creds.onRefreshToken);
      const sites = await listGoogleSites(accessToken);
      const match = sites.find((site) => site.siteUrl === property);
      if (!match) {
        return {
          message: `Connected, but ${property} is not in this account's verified sites.`,
          ok: false,
        };
      }
      return { message: `Connection OK · ${property} (${match.permissionLevel}).`, ok: true };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : "Search Console connection test failed.",
        ok: false,
      };
    }
  },

  async fetchSearchAnalytics(input: GscQueryInput): Promise<GscRow[]> {
    return fetchSearchAnalytics(input);
  },

  async fetchTopQueries(
    credentials: ProviderCredentials,
    input: { limit: number },
  ): Promise<AnalyticsTopQuery[]> {
    const range = last28DaysRange();
    const rows = await fetchSearchAnalytics({
      credentials,
      dimensions: ["query"],
      endDate: range.endDate,
      rowLimit: input.limit,
      startDate: range.startDate,
    });
    return rows.flatMap((row) => {
      const query = topQueryFromRow(row);
      return query ? [query] : [];
    });
  },

  async fetchQueryStats(
    credentials: ProviderCredentials,
    input: AnalyticsQueryStatsInput,
  ): Promise<QueryStatRow[]> {
    const rows = await fetchGscQueryStats(credentials, input, fetchSearchAnalytics);
    const stats = rows.flatMap((row) => {
      const stat = queryStatFromRow(row, Boolean(input.pagePath));
      return stat ? [stat] : [];
    });
    return filterGscQueryStats(stats, input);
  },

  // GET sitemaps/{feedpath} reports parse state - isPending while GSC is still reading,
  // and errors/warnings counts once processed (works with readonly scope too).
  async getSitemapStatus(creds: ProviderCredentials, feedpath: string): Promise<GscSitemapStatus> {
    const { property, refreshToken } = readCredentials(creds);
    const accessToken = await refreshGoogleAccessToken(refreshToken, creds.onRefreshToken);
    const data = await googleApiFetch<WmxSitemap>(
      sitemapUrl(property, feedpath),
      accessToken,
      {},
      fetchContext(creds, property),
    );
    return {
      contents: (data.contents ?? []).map((entry) => ({
        submitted: numberValue(entry.submitted),
        type: typeof entry.type === "string" ? entry.type : "web",
      })),
      errors: numberValue(data.errors),
      isPending: data.isPending === true,
      isSitemapsIndex: data.isSitemapsIndex === true,
      lastDownloaded: typeof data.lastDownloaded === "string" ? data.lastDownloaded : null,
      lastSubmitted: typeof data.lastSubmitted === "string" ? data.lastSubmitted : null,
      path: typeof data.path === "string" ? data.path : feedpath,
      warnings: numberValue(data.warnings),
    };
  },

  // URL Inspection reports the indexed state Google already knows about. It is
  // not a live crawl, so sync callers keep it bounded and incremental.
  async inspectUrl(
    creds: ProviderCredentials,
    input: GscUrlInspectionInput,
  ): Promise<GscUrlInspectionResult> {
    const session = await createGscUrlInspectionSession(creds);
    return session.inspectUrl(input);
  },
};
