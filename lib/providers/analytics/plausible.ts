import "server-only";

import { assertWebhookUrlAllowed } from "@/lib/alerts/webhook-guard";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderConfigurationError, ProviderHttpError } from "@/lib/providers/failure-class";
import {
  consumeProviderLimit,
  ProviderRateLimitedError,
  providerAccountKey,
  writeCooldown,
} from "@/lib/providers/rate-limit";
import type {
  AnalyticsProvider,
  PageStatRow,
  ProviderCredentials,
  ProviderTestResult,
} from "@/lib/providers/types";

const DEFAULT_BASE_URL = "https://plausible.io";
const ORGANIC_SEARCH_FILTER = [["is", "visit:channel", ["Organic Search"]]] as const;
const PAGE_DIMENSIONS = ["event:page"] as const;
const PAGE_METRICS = [
  "visitors",
  "visits",
  "bounce_rate",
  "visit_duration",
  "scroll_depth",
] as const;

type PlausibleMetric = (typeof PAGE_METRICS)[number] | "visitors";
type PlausibleQuery = {
  site_id: string;
  metrics: readonly PlausibleMetric[];
  date_range: [string, string];
  dimensions?: readonly string[];
  filters?: typeof ORGANIC_SEARCH_FILTER;
  pagination?: { limit: number };
};
type PlausibleResultRow = { dimensions?: unknown[]; metrics?: unknown[] };
type PlausibleResponse = {
  error?: unknown;
  message?: unknown;
  results?: PlausibleResultRow[];
};

class PlausibleApiError extends ProviderHttpError {
  constructor(message: string, status: number) {
    super(status, message);
    this.name = "PlausibleApiError";
  }
}

function normalizeBaseUrl(endpoint: string | undefined) {
  const value = endpoint?.trim() || DEFAULT_BASE_URL;
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

const ENDPOINT_BLOCKED_ERROR =
  "Plausible endpoint must be a public http(s) URL. Set WEBHOOK_ALLOW_PRIVATE_NETWORK=1 only for self-hosted internal deployments.";

// Validate user-supplied endpoints against protocol and DNS-resolved private-network
// SSRF guards; the trusted hosted default bypasses this check.
async function assertEndpointAllowed(baseUrl: string) {
  try {
    await assertWebhookUrlAllowed(baseUrl);
  } catch {
    throw new ProviderConfigurationError(ENDPOINT_BLOCKED_ERROR);
  }
}

function readCredentials(creds: ProviderCredentials) {
  const apiKey = creds.apiKey?.trim();
  const siteId = creds.login?.trim();
  const baseUrl = normalizeBaseUrl(creds.endpoint);
  if (!siteId || !apiKey) {
    throw new ProviderConfigurationError("Plausible requires a site domain and API token.");
  }
  return {
    accountKey: providerAccountKey("plausible", {
      apiKey,
      endpoint: creds.endpoint ? baseUrl : undefined,
      login: siteId,
    }),
    apiKey,
    baseUrl,
    siteId,
  };
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function queryUrl(baseUrl: string) {
  return `${baseUrl}/api/v2/query`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function responseMessage(payload: PlausibleResponse | null, status: number) {
  const error =
    typeof payload?.error === "object" && payload.error !== null
      ? stringValue((payload.error as { message?: unknown }).message)
      : stringValue(payload?.error);
  return (
    error ?? stringValue(payload?.message) ?? `Plausible API request failed with status ${status}.`
  );
}

async function parseJson(response: Response): Promise<PlausibleResponse> {
  const payload = (await response.json().catch(() => null)) as PlausibleResponse | null;
  if (payload === null) {
    throw new PlausibleApiError("Plausible API returned an invalid JSON body.", response.status);
  }
  return payload;
}

async function runQuery(creds: ProviderCredentials, query: PlausibleQuery) {
  const { accountKey, apiKey, baseUrl } = readCredentials(creds);
  if (creds.endpoint?.trim()) {
    await assertEndpointAllowed(baseUrl);
  }
  const gate = await consumeProviderLimit("plausible", undefined, { accountKey });
  if (!gate.success) {
    throw new ProviderRateLimitedError("plausible", { accountKey, resetAt: gate.resetAt });
  }

  const response = await fetch(queryUrl(baseUrl), {
    body: JSON.stringify(query),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (response.status === 429) {
    const resetAt = writeCooldown(accountKey);
    throw new ProviderRateLimitedError("plausible", { accountKey, resetAt });
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError("plausible");
  }

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new PlausibleApiError(responseMessage(payload, response.status), response.status);
  }
  return payload;
}

function pageQuery(input: {
  endDate: string;
  limit?: number;
  metrics: readonly PlausibleMetric[];
  siteId: string;
  startDate: string;
}): PlausibleQuery {
  return {
    date_range: [input.startDate, input.endDate],
    dimensions: PAGE_DIMENSIONS,
    filters: ORGANIC_SEARCH_FILTER,
    metrics: input.metrics,
    ...(input.limit !== undefined ? { pagination: { limit: input.limit } } : {}),
    site_id: input.siteId,
  };
}

function metricNumber(
  row: PlausibleResultRow,
  metrics: readonly PlausibleMetric[],
  metric: PlausibleMetric,
) {
  const index = metrics.indexOf(metric);
  return index === -1 ? undefined : numberValue(row.metrics?.[index]);
}

function normalizePercent(value: number | undefined) {
  if (value === undefined) return undefined;
  const rate = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, rate));
}

function rowToPageStat(
  row: PlausibleResultRow,
  metrics: readonly PlausibleMetric[],
): PageStatRow | null {
  const path = stringValue(row.dimensions?.[0]);
  if (!path) return null;

  return {
    bounceRate: normalizePercent(metricNumber(row, metrics, "bounce_rate")),
    path,
    scrollDepth: metricNumber(row, metrics, "scroll_depth"),
    sessions: metricNumber(row, metrics, "visits") ?? 0,
    visitDurationSeconds: metricNumber(row, metrics, "visit_duration"),
    visitors: metricNumber(row, metrics, "visitors"),
  };
}

function isScrollDepthRejection(error: unknown) {
  return (
    error instanceof PlausibleApiError &&
    (error.status === 400 || error.status === 422) &&
    /scroll_depth/i.test(error.message)
  );
}

export const plausibleAnalyticsProvider: AnalyticsProvider = {
  id: "plausible",
  label: "Plausible",

  async testConnection(creds: ProviderCredentials): Promise<ProviderTestResult> {
    try {
      const { siteId } = readCredentials(creds);
      const date = todayDate();
      await runQuery(creds, {
        date_range: [date, date],
        metrics: ["visitors"],
        site_id: siteId,
      });
      return { message: `Connection OK · ${siteId}.`, ok: true };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : "Plausible connection test failed.",
        ok: false,
      };
    }
  },

  async fetchPageStats(credentials, input) {
    const { siteId } = readCredentials(credentials);
    const queryInput = {
      endDate: input.endDate,
      limit: input.limit,
      siteId,
      startDate: input.startDate,
    };

    try {
      const data = await runQuery(credentials, pageQuery({ ...queryInput, metrics: PAGE_METRICS }));
      return (data.results ?? [])
        .map((row) => rowToPageStat(row, PAGE_METRICS))
        .filter((row) => row !== null);
    } catch (error) {
      if (!isScrollDepthRejection(error)) throw error;
      const metrics = PAGE_METRICS.filter((metric) => metric !== "scroll_depth");
      const data = await runQuery(credentials, pageQuery({ ...queryInput, metrics }));
      return (data.results ?? [])
        .map((row) => rowToPageStat(row, metrics))
        .filter((row) => row !== null);
    }
  },
};
