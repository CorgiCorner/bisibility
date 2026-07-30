import { ProviderConfigurationError } from "@/lib/providers/failure-class";
import { providerAccountKey } from "@/lib/providers/rate-limit";
import type {
  AnalyticsProvider,
  AnalyticsTopQuery,
  PageStatRow,
  ProviderCredentials,
  ProviderTestResult,
} from "@/lib/providers/types";
import { type GoogleFetchContext, googleApiFetch, refreshGoogleAccessToken } from "./google-client";
import { normalizeGa4PropertyId } from "./property-id";

// Credentials are the encrypted ProviderConnection.credentialsEncrypted JSON written by the
// OAuth connect flow: `apiKey` holds the refresh token, `login` the GA4 property id.
function readCredentials(creds: ProviderCredentials) {
  const raw = creds.login?.trim();
  if (!raw) {
    throw new Error("Google Analytics 4 connection is missing a property. Reconnect the account.");
  }
  const normalized = normalizeGa4PropertyId(raw);
  if (!normalized.ok) {
    throw new ProviderConfigurationError(normalized.error.message);
  }
  const property = `properties/${normalized.value}`;
  return { property, refreshToken: creds.apiKey };
}

// Rate-limit account is the Google account (refresh token) scoped to the property,
// approximating GA4's per-property token quota with a per-minute window.
function fetchContext(creds: ProviderCredentials, property: string): GoogleFetchContext {
  return {
    accountKey: providerAccountKey("ga4", { apiKey: creds.apiKey, login: property }),
    providerId: "ga4",
  };
}

export type Ga4ReportInput = {
  credentials: ProviderCredentials;
  dimensionFilter?: Ga4DimensionFilter;
  dimensions?: string[];
  endDate: string;
  limit?: number;
  metrics?: string[];
  orderBys?: Ga4ReportOrderBy[];
  startDate: string;
};

export type Ga4DimensionFilter = {
  filter: {
    fieldName: string;
    stringFilter: { value: string };
  };
};

export type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

type Ga4ReportOrderBy = {
  desc?: boolean;
  metric: { metricName: string };
};

function reportUrl(property: string) {
  return `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`;
}

function reportBody(input: {
  dimensionFilter?: Ga4DimensionFilter;
  dimensions?: string[];
  endDate: string;
  limit?: number;
  metrics?: string[];
  orderBys?: Ga4ReportOrderBy[];
  startDate: string;
}) {
  const body: {
    dateRanges: Array<{ endDate: string; startDate: string }>;
    dimensions: Array<{ name: string }>;
    dimensionFilter?: Ga4DimensionFilter;
    limit?: string;
    metrics: Array<{ name: string }>;
    orderBys?: Ga4ReportOrderBy[];
  } = {
    dateRanges: [{ endDate: input.endDate, startDate: input.startDate }],
    dimensions: (input.dimensions ?? ["date"]).map((name) => ({ name })),
    metrics: (input.metrics ?? ["sessions"]).map((name) => ({ name })),
  };
  if (input.limit !== undefined) {
    body.limit = String(input.limit);
  }
  if (input.dimensionFilter) {
    body.dimensionFilter = input.dimensionFilter;
  }
  if (input.orderBys?.length) {
    body.orderBys = input.orderBys;
  }
  return JSON.stringify(body);
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function topQueryFromRow(row: Ga4Row): AnalyticsTopQuery | null {
  const query = row.dimensionValues?.[0]?.value?.trim();
  if (!query || query === "(not set)") return null;
  return {
    clicks: numberValue(row.metricValues?.[0]?.value),
    query,
  };
}

function pageStatFromRow(row: Ga4Row): PageStatRow | null {
  const landingPage = row.dimensionValues?.[0]?.value?.trim();
  if (!landingPage || landingPage === "(not set)") return null;
  return {
    engagementRate: numberValue(row.metricValues?.[1]?.value),
    keyEvents: numberValue(row.metricValues?.[2]?.value),
    path: landingPage.startsWith("/") ? landingPage : `/${landingPage}`,
    sessions: numberValue(row.metricValues?.[0]?.value),
  };
}

async function fetchReport(input: Ga4ReportInput): Promise<Ga4Row[]> {
  const { property, refreshToken } = readCredentials(input.credentials);
  const accessToken = await refreshGoogleAccessToken(
    refreshToken,
    input.credentials.onRefreshToken,
  );
  const data = await googleApiFetch<{ rows?: Ga4Row[] }>(
    reportUrl(property),
    accessToken,
    {
      body: reportBody(input),
      method: "POST",
    },
    fetchContext(input.credentials, property),
  );
  return data.rows ?? [];
}

export type Ga4AnalyticsProvider = AnalyticsProvider & {
  fetchReport(input: Ga4ReportInput): Promise<Ga4Row[]>;
  fetchTopQueries(
    credentials: ProviderCredentials,
    input: { limit: number },
  ): Promise<AnalyticsTopQuery[]>;
  fetchPageStats(
    credentials: ProviderCredentials,
    input: { endDate: string; limit?: number; startDate: string },
  ): Promise<PageStatRow[]>;
};

export const ga4AnalyticsProvider: Ga4AnalyticsProvider = {
  id: "ga4",
  label: "Google Analytics 4",

  async testConnection(creds: ProviderCredentials): Promise<ProviderTestResult> {
    try {
      const { property, refreshToken } = readCredentials(creds);
      const accessToken = await refreshGoogleAccessToken(refreshToken, creds.onRefreshToken);
      await googleApiFetch(reportUrl(property), accessToken, {
        body: reportBody({
          endDate: "today",
          limit: 1,
          metrics: ["activeUsers"],
          startDate: "yesterday",
        }),
        method: "POST",
      });
      return { message: `Connection OK · ${property}.`, ok: true };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : "Analytics 4 connection test failed.",
        ok: false,
      };
    }
  },

  async fetchReport(input: Ga4ReportInput): Promise<Ga4Row[]> {
    return fetchReport(input);
  },

  async fetchTopQueries(
    credentials: ProviderCredentials,
    input: { limit: number },
  ): Promise<AnalyticsTopQuery[]> {
    const rows = await fetchReport({
      credentials,
      dimensions: ["searchTerm"],
      endDate: "today",
      limit: input.limit,
      metrics: ["eventCount"],
      orderBys: [{ desc: true, metric: { metricName: "eventCount" } }],
      startDate: "28daysAgo",
    });
    return rows
      .flatMap((row) => {
        const query = topQueryFromRow(row);
        return query ? [query] : [];
      })
      .slice(0, input.limit);
  },

  async fetchPageStats(
    credentials: ProviderCredentials,
    input: { endDate: string; limit?: number; startDate: string },
  ): Promise<PageStatRow[]> {
    const rows = await fetchReport({
      credentials,
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { value: "Organic Search" },
        },
      },
      dimensions: ["landingPage"],
      endDate: input.endDate,
      limit: input.limit ?? 1000,
      metrics: ["sessions", "engagementRate", "keyEvents"],
      startDate: input.startDate,
    });
    return rows.flatMap((row) => {
      const stat = pageStatFromRow(row);
      return stat ? [stat] : [];
    });
  },
};
