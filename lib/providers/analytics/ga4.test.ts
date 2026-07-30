import { clearProviderRateLimitState, ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ga4AnalyticsProvider } from "./ga4";

const tokenResponse = { access_token: "access_token" };

let reportResponse: {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

describe("ga4 analytics provider", () => {
  beforeEach(() => {
    clearProviderRateLimitState();
    reportResponse = {
      rows: [
        { dimensionValues: [{ value: " pricing " }], metricValues: [{ value: "9" }] },
        { dimensionValues: [{ value: "(not set)" }], metricValues: [{ value: "8" }] },
        { dimensionValues: [{ value: "" }], metricValues: [{ value: "7" }] },
        { dimensionValues: [{ value: "docs" }], metricValues: [{ value: "6" }] },
        { dimensionValues: [{ value: "integrations" }], metricValues: [{ value: "5" }] },
      ],
    };
    vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client_id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client_secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes(":runReport")) {
          return Response.json(reportResponse);
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    clearProviderRateLimitState();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses a one-row report as the connection probe", async () => {
    await expect(
      ga4AnalyticsProvider.testConnection({ apiKey: "refresh_token", login: "123" }),
    ).resolves.toEqual({ message: "Connection OK · properties/123.", ok: true });

    const fetchMock = vi.mocked(fetch);
    const reportCall = fetchMock.mock.calls.find(([url]) => String(url).includes(":runReport"));
    expect(reportCall).toBeDefined();
    expect(JSON.parse(String(reportCall?.[1]?.body))).toEqual({
      dateRanges: [{ endDate: "today", startDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      limit: "1",
      metrics: [{ name: "activeUsers" }],
    });
  });

  it("fetches top queries from site-search terms", async () => {
    await expect(
      ga4AnalyticsProvider.fetchTopQueries(
        { apiKey: "refresh_token", login: "properties/123" },
        { limit: 2 },
      ),
    ).resolves.toEqual([
      { clicks: 9, query: "pricing" },
      { clicks: 6, query: "docs" },
    ]);

    const fetchMock = vi.mocked(fetch);
    const reportCall = fetchMock.mock.calls.find(([url]) => String(url).includes(":runReport"));
    expect(reportCall).toBeDefined();
    expect(reportCall?.[0]).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport",
    );
    const body = JSON.parse(String(reportCall?.[1]?.body));
    expect(body).not.toHaveProperty("dimensionFilter");
    expect(body).toEqual({
      dateRanges: [{ endDate: "today", startDate: "28daysAgo" }],
      dimensions: [{ name: "searchTerm" }],
      limit: "2",
      metrics: [{ name: "eventCount" }],
      orderBys: [{ desc: true, metric: { metricName: "eventCount" } }],
    });
    expect(reportCall?.[1]?.headers).toMatchObject({
      Authorization: "Bearer access_token",
      "Content-Type": "application/json",
    });
  });

  it("returns an empty list when there are no site-search terms", async () => {
    reportResponse = { rows: [] };

    await expect(
      ga4AnalyticsProvider.fetchTopQueries(
        { apiKey: "refresh_token", login: "properties/123" },
        { limit: 25 },
      ),
    ).resolves.toEqual([]);
  });

  it("returns an empty list when GA4 omits the rows key", async () => {
    reportResponse = {};

    await expect(
      ga4AnalyticsProvider.fetchTopQueries(
        { apiKey: "refresh_token", login: "properties/123" },
        { limit: 25 },
      ),
    ).resolves.toEqual([]);
  });

  it("filters unset search terms", async () => {
    reportResponse = {
      rows: [
        { dimensionValues: [{ value: "(not set)" }], metricValues: [{ value: "4" }] },
        { dimensionValues: [{ value: "   " }], metricValues: [{ value: "3" }] },
      ],
    };

    await expect(
      ga4AnalyticsProvider.fetchTopQueries(
        { apiKey: "refresh_token", login: "properties/123" },
        { limit: 25 },
      ),
    ).resolves.toEqual([]);
  });

  it("coerces partial top-query rows to numeric clicks", async () => {
    reportResponse = {
      rows: [
        { dimensionValues: [{ value: " docs " }], metricValues: [{ value: "not-a-number" }] },
        { dimensionValues: [{ value: " pricing " }], metricValues: [] },
        { dimensionValues: [{ value: " api " }] },
      ],
    };

    await expect(
      ga4AnalyticsProvider.fetchTopQueries(
        { apiKey: "refresh_token", login: "properties/123" },
        { limit: 3 },
      ),
    ).resolves.toEqual([
      { clicks: 0, query: "docs" },
      { clicks: 0, query: "pricing" },
      { clicks: 0, query: "api" },
    ]);
  });

  it("fetches organic search landing page stats", async () => {
    reportResponse = {
      rows: [
        {
          dimensionValues: [{ value: "/pricing" }],
          metricValues: [{ value: "12" }, { value: "0.625" }, { value: "3" }],
        },
        {
          dimensionValues: [{ value: "docs?tab=api" }],
          metricValues: [{ value: "7" }, { value: "0.5" }, { value: "2" }],
        },
        {
          dimensionValues: [{ value: "(not set)" }],
          metricValues: [{ value: "9" }, { value: "0.4" }, { value: "1" }],
        },
        {
          dimensionValues: [{ value: "" }],
          metricValues: [{ value: "8" }, { value: "0.3" }, { value: "1" }],
        },
      ],
    };

    await expect(
      ga4AnalyticsProvider.fetchPageStats(
        { apiKey: "refresh_token", login: "123" },
        { endDate: "2026-07-03", limit: 50, startDate: "2026-07-01" },
      ),
    ).resolves.toEqual([
      { engagementRate: 0.625, keyEvents: 3, path: "/pricing", sessions: 12 },
      { engagementRate: 0.5, keyEvents: 2, path: "/docs?tab=api", sessions: 7 },
    ]);

    const fetchMock = vi.mocked(fetch);
    const reportCall = fetchMock.mock.calls.find(([url]) => String(url).includes(":runReport"));
    expect(reportCall).toBeDefined();
    expect(reportCall?.[0]).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport",
    );
    expect(JSON.parse(String(reportCall?.[1]?.body))).toEqual({
      dateRanges: [{ endDate: "2026-07-03", startDate: "2026-07-01" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { value: "Organic Search" },
        },
      },
      dimensions: [{ name: "landingPage" }],
      limit: "50",
      metrics: [{ name: "sessions" }, { name: "engagementRate" }, { name: "keyEvents" }],
    });
  });

  it("uses a default limit for page stats", async () => {
    reportResponse = { rows: [] };

    await ga4AnalyticsProvider.fetchPageStats(
      { apiKey: "refresh_token", login: "properties/123" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    const fetchMock = vi.mocked(fetch);
    const reportCall = fetchMock.mock.calls.find(([url]) => String(url).includes(":runReport"));
    expect(JSON.parse(String(reportCall?.[1]?.body)).limit).toBe("1000");
  });

  it("coerces partial page-stat rows and filters missing landing pages", async () => {
    reportResponse = {
      rows: [
        {
          dimensionValues: [{ value: "blog" }],
          metricValues: [{ value: "not-a-number" }, { value: "0.4" }],
        },
        { dimensionValues: [], metricValues: [{ value: "8" }, { value: "0.3" }, { value: "2" }] },
        { metricValues: [{ value: "7" }, { value: "0.2" }, { value: "1" }] },
      ],
    };

    await expect(
      ga4AnalyticsProvider.fetchPageStats(
        { apiKey: "refresh_token", login: "properties/123" },
        { endDate: "2026-07-03", startDate: "2026-07-01" },
      ),
    ).resolves.toEqual([{ engagementRate: 0.4, keyEvents: 0, path: "/blog", sessions: 0 }]);
  });

  it("maps GA4 429 responses to ProviderRateLimitedError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes(":runReport")) {
          return Response.json({ error: { message: "Too many requests" } }, { status: 429 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const rejection = ga4AnalyticsProvider.fetchPageStats(
      { apiKey: "refresh_token", login: "properties/123" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    await expect(rejection).rejects.toBeInstanceOf(ProviderRateLimitedError);
    await rejection.catch((error: unknown) => {
      expect(error).toMatchObject({ providerId: "ga4" });
    });
  });

  it("surfaces GA4 quota 403 messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes(":runReport")) {
          return Response.json(
            { error: { message: "Quota exceeded for analytics data tokens" } },
            { status: 403 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const rejection = ga4AnalyticsProvider.fetchPageStats(
      { apiKey: "refresh_token", login: "properties/123" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    await expect(rejection).rejects.toThrow("Quota exceeded for analytics data tokens");
    await rejection.catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ProviderRateLimitedError);
    });
  });
});
