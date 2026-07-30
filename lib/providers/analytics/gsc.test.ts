import { clearProviderRateLimitState, ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gscAnalyticsProvider } from "./gsc";
import { GSC_QUERY_STATS_PAGE_SIZE, GSC_QUERY_STATS_ROW_CAP } from "./gsc-query-pagination";

const tokenResponse = { access_token: "access_token" };
const searchAnalyticsResponse = {
  rows: [
    {
      clicks: 3,
      ctr: 0.1,
      impressions: 40,
      keys: [" seo api ", "https://example.com/blog/post"],
      position: 4,
    },
    { clicks: 1, ctr: 0.02, impressions: 20, keys: [""], position: 8 },
  ],
};
const inspectionResponse = {
  inspectionResult: {
    indexStatusResult: {
      coverageState: "Submitted and indexed",
      googleCanonical: "https://example.com/page",
      lastCrawlTime: "2026-07-01T10:15:00Z",
      userCanonical: "https://example.com/page",
      verdict: "PASS",
    },
  },
};

describe("gsc analytics provider", () => {
  beforeEach(() => {
    clearProviderRateLimitState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
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
        if (target.includes("/searchAnalytics/query")) {
          return Response.json(searchAnalyticsResponse);
        }
        if (target.includes("/urlInspection/index:inspect")) {
          return Response.json(inspectionResponse);
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    clearProviderRateLimitState();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("matches a legacy bare domain against Google's canonical domain property", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.endsWith("/webmasters/v3/sites")) {
          return Response.json({
            siteEntry: [{ permissionLevel: "siteOwner", siteUrl: "sc-domain:example.com" }],
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await expect(
      gscAnalyticsProvider.testConnection({ apiKey: "refresh_token", login: "example.com" }),
    ).resolves.toEqual({
      message: "Connection OK · sc-domain:example.com (siteOwner).",
      ok: true,
    });
  });

  it("accepts a verified property before Search Analytics has any rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.endsWith("/webmasters/v3/sites")) {
          return Response.json({
            siteEntry: [{ permissionLevel: "siteOwner", siteUrl: "sc-domain:new-site.test" }],
          });
        }
        if (target.includes("/searchAnalytics/query")) return Response.json({});
        return new Response("not found", { status: 404 });
      }),
    );

    await expect(
      gscAnalyticsProvider.testConnection({
        apiKey: "refresh_token",
        login: "sc-domain:new-site.test",
      }),
    ).resolves.toEqual({
      message: "Connection OK · sc-domain:new-site.test (siteOwner).",
      ok: true,
    });
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/searchAnalytics/query")),
    ).toBe(false);
  });

  it("fetches top queries from Search Analytics over the last 28 days", async () => {
    await expect(
      gscAnalyticsProvider.fetchTopQueries(
        { apiKey: "refresh_token", login: "sc-domain:example.com" },
        { limit: 25 },
      ),
    ).resolves.toEqual([{ clicks: 3, impressions: 40, query: "seo api" }]);

    const fetchMock = vi.mocked(fetch);
    const queryCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/searchAnalytics/query"),
    );
    expect(queryCall).toBeDefined();
    expect(queryCall?.[0]).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query",
    );
    expect(JSON.parse(String(queryCall?.[1]?.body))).toEqual({
      dimensions: ["query"],
      endDate: "2026-07-01",
      rowLimit: 25,
      startDate: "2026-06-04",
    });
    expect(queryCall?.[1]?.headers).toMatchObject({
      Authorization: "Bearer access_token",
      "Content-Type": "application/json",
    });
  });

  it("fetches query stats for an explicit date range", async () => {
    const rows = await gscAnalyticsProvider.fetchQueryStats(
      { apiKey: "refresh_token", login: "sc-domain:example.com" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    expect(rows).toEqual([{ clicks: 3, ctr: 0.1, impressions: 40, position: 4, query: "seo api" }]);
    expect(rows[0]).not.toHaveProperty("page");

    const fetchMock = vi.mocked(fetch);
    const queryCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/searchAnalytics/query"),
    );
    expect(queryCall).toBeDefined();
    expect(JSON.parse(String(queryCall?.[1]?.body))).toEqual({
      dimensions: ["query"],
      endDate: "2026-07-03",
      rowLimit: GSC_QUERY_STATS_PAGE_SIZE,
      startRow: 0,
      startDate: "2026-07-01",
    });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/searchAnalytics/query")),
    ).toHaveLength(1);
  });

  it("assembles paginated bulk query stats", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes("/searchAnalytics/query")) {
          const { startRow = 0 } = JSON.parse(String(init?.body));
          const length = startRow === 0 ? GSC_QUERY_STATS_PAGE_SIZE : 2;
          return Response.json({
            rows: Array.from({ length }, (_, index) => ({
              clicks: 1,
              ctr: 0.1,
              impressions: 10,
              keys: [`query-${startRow + index}`],
              position: 2,
            })),
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const rows = await gscAnalyticsProvider.fetchQueryStats(
      { apiKey: "refresh_token", login: "sc-domain:example.com" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    expect(rows).toHaveLength(GSC_QUERY_STATS_PAGE_SIZE + 2);
    expect(rows.at(-1)?.query).toBe(`query-${GSC_QUERY_STATS_PAGE_SIZE + 1}`);
    const queryCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/searchAnalytics/query"));
    expect(queryCalls.map(([, init]) => JSON.parse(String(init?.body)).startRow)).toEqual([
      0,
      GSC_QUERY_STATS_PAGE_SIZE,
    ]);
  });

  it("stops bulk query pagination at the hard row cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes("/searchAnalytics/query")) {
          const { startRow = 0 } = JSON.parse(String(init?.body));
          return Response.json({
            rows: Array.from({ length: GSC_QUERY_STATS_PAGE_SIZE }, (_, index) => ({
              clicks: 1,
              ctr: 0.1,
              impressions: 10,
              keys: [`query-${startRow + index}`],
              position: 2,
            })),
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const rows = await gscAnalyticsProvider.fetchQueryStats(
      { apiKey: "refresh_token", login: "sc-domain:example.com" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    expect(rows).toHaveLength(GSC_QUERY_STATS_ROW_CAP);
    const queryCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/searchAnalytics/query"));
    expect(queryCalls).toHaveLength(3);
    expect(queryCalls.map(([, init]) => JSON.parse(String(init?.body)).startRow)).toEqual([
      0,
      GSC_QUERY_STATS_PAGE_SIZE,
      GSC_QUERY_STATS_PAGE_SIZE * 2,
    ]);
  });

  it("filters query stats to one exact Search Analytics query", async () => {
    await gscAnalyticsProvider.fetchQueryStats(
      { apiKey: "refresh_token", login: "sc-domain:example.com" },
      { endDate: "2026-07-03", query: "seo api", startDate: "2026-07-01" },
    );

    const queryCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/searchAnalytics/query"));
    expect(JSON.parse(String(queryCall?.[1]?.body))).toEqual({
      dimensionFilterGroups: [
        { filters: [{ dimension: "query", expression: "seo api", operator: "equals" }] },
      ],
      dimensions: ["query"],
      endDate: "2026-07-03",
      rowLimit: 1,
      startDate: "2026-07-01",
    });
  });

  it("filters query stats by page-path prefix", async () => {
    await expect(
      gscAnalyticsProvider.fetchQueryStats(
        { apiKey: "refresh_token", login: "sc-domain:example.com" },
        {
          endDate: "2026-07-03",
          limit: 25,
          pagePath: { match: "prefix", value: "/blog/*" },
          startDate: "2026-07-01",
        },
      ),
    ).resolves.toEqual([
      {
        clicks: 3,
        ctr: 0.1,
        impressions: 40,
        page: "https://example.com/blog/post",
        position: 4,
        query: "seo api",
      },
    ]);

    const queryCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/searchAnalytics/query"));
    expect(JSON.parse(String(queryCall?.[1]?.body))).toEqual({
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: "page",
              expression: "^https?://[^/]+/blog/",
              operator: "includingRegex",
            },
          ],
        },
      ],
      dimensions: ["query", "page"],
      endDate: "2026-07-03",
      rowLimit: 25,
      startDate: "2026-07-01",
    });
  });

  it("composes a page contains filter with an exact query filter", async () => {
    await gscAnalyticsProvider.fetchQueryStats(
      { apiKey: "refresh_token", login: "sc-domain:example.com" },
      {
        endDate: "2026-07-03",
        limit: 10,
        pagePath: { match: "contains", value: "/docs/" },
        query: "seo api",
        startDate: "2026-07-01",
      },
    );

    const queryCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/searchAnalytics/query"));
    expect(JSON.parse(String(queryCall?.[1]?.body))).toEqual({
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: "query", expression: "seo api", operator: "equals" },
            { dimension: "page", expression: "/docs/", operator: "contains" },
          ],
        },
      ],
      dimensions: ["query", "page"],
      endDate: "2026-07-03",
      rowLimit: 10,
      startDate: "2026-07-01",
    });
  });

  it("applies inclusive metric ranges after normalizing query stats", async () => {
    const rows = [
      { clicks: 2, impressions: 20, position: 3, query: "lower-boundary" },
      { clicks: 8, impressions: 80, position: 9, query: "upper-boundary" },
      { clicks: 1, impressions: 40, position: 5, query: "clicks-below" },
      { clicks: 9, impressions: 40, position: 5, query: "clicks-above" },
      { clicks: 4, impressions: 19, position: 5, query: "impressions-below" },
      { clicks: 4, impressions: 81, position: 5, query: "impressions-above" },
      { clicks: 4, impressions: 40, position: 2.9, query: "position-below" },
      { clicks: 4, impressions: 40, position: 9.1, query: "position-above" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) return Response.json(tokenResponse);
        if (target.includes("/searchAnalytics/query")) {
          return Response.json({
            rows: rows.map((row) => ({ ...row, ctr: 0.1, keys: [row.query] })),
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await expect(
      gscAnalyticsProvider.fetchQueryStats(
        { apiKey: "refresh_token", login: "sc-domain:example.com" },
        {
          clicks: { max: 8, min: 2 },
          endDate: "2026-07-03",
          impressions: { max: 80, min: 20 },
          limit: rows.length,
          position: { max: 9, min: 3 },
          startDate: "2026-07-01",
        },
      ),
    ).resolves.toEqual([
      {
        clicks: 2,
        ctr: 0.1,
        impressions: 20,
        position: 3,
        query: "lower-boundary",
      },
      {
        clicks: 8,
        ctr: 0.1,
        impressions: 80,
        position: 9,
        query: "upper-boundary",
      },
    ]);

    const queryCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/searchAnalytics/query"));
    expect(JSON.parse(String(queryCall?.[1]?.body))).toEqual({
      dimensions: ["query"],
      endDate: "2026-07-03",
      rowLimit: rows.length,
      startDate: "2026-07-01",
    });
  });

  it("returns empty query stats when Search Analytics omits rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes("/searchAnalytics/query")) {
          return Response.json({});
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await expect(
      gscAnalyticsProvider.fetchQueryStats(
        { apiKey: "refresh_token", login: "sc-domain:example.com" },
        { endDate: "2026-07-03", startDate: "2026-07-01" },
      ),
    ).resolves.toEqual([]);
  });

  it("coerces partial Search Analytics rows and drops rows without a query key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes("/searchAnalytics/query")) {
          return Response.json({
            rows: [
              {
                clicks: "5",
                ctr: "0.25",
                impressions: "80",
                keys: [" docs api "],
                position: "2.5",
              },
              { clicks: "bad", ctr: null, impressions: undefined, keys: ["   "], position: 7 },
              { clicks: 1, ctr: 0.1, impressions: 10, keys: [], position: 1 },
            ],
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await expect(
      gscAnalyticsProvider.fetchQueryStats(
        { apiKey: "refresh_token", login: "sc-domain:example.com" },
        { endDate: "2026-07-03", limit: 12, startDate: "2026-07-01" },
      ),
    ).resolves.toEqual([
      { clicks: 5, ctr: 0.25, impressions: 80, position: 2.5, query: "docs api" },
    ]);

    const fetchMock = vi.mocked(fetch);
    const queryCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/searchAnalytics/query"),
    );
    expect(JSON.parse(String(queryCall?.[1]?.body)).rowLimit).toBe(12);
  });

  it("inspects URL index status with the selected property", async () => {
    await expect(
      gscAnalyticsProvider.inspectUrl(
        { apiKey: "refresh_token", login: "sc-domain:example.com" },
        { property: "sc-domain:example.com", url: "https://example.com/page" },
      ),
    ).resolves.toEqual({
      coverageState: "Submitted and indexed",
      googleCanonical: "https://example.com/page",
      lastCrawlAt: new Date("2026-07-01T10:15:00Z"),
      userCanonical: "https://example.com/page",
      verdict: "PASS",
    });

    const fetchMock = vi.mocked(fetch);
    const inspectCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/urlInspection/index:inspect"),
    );
    expect(inspectCall).toBeDefined();
    expect(inspectCall?.[0]).toBe(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    );
    expect(JSON.parse(String(inspectCall?.[1]?.body))).toEqual({
      inspectionUrl: "https://example.com/page",
      siteUrl: "sc-domain:example.com",
    });
    expect(inspectCall?.[1]?.headers).toMatchObject({
      Authorization: "Bearer access_token",
      "Content-Type": "application/json",
    });
  });

  it("reuses one access token for every URL in an inspection session", async () => {
    const session = await gscAnalyticsProvider.createUrlInspectionSession({
      apiKey: "refresh_token",
      login: "sc-domain:example.com",
    });

    await session.inspectUrl({
      property: "sc-domain:example.com",
      url: "https://example.com/first",
    });
    await session.inspectUrl({
      property: "sc-domain:example.com",
      url: "https://example.com/second",
    });

    const calls = vi.mocked(fetch).mock.calls;
    expect(
      calls.filter(([url]) => String(url).includes("oauth2.googleapis.com/token")),
    ).toHaveLength(1);
    expect(
      calls.filter(([url]) => String(url).includes("/urlInspection/index:inspect")),
    ).toHaveLength(2);
  });

  it("surfaces URL inspection API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes("/urlInspection/index:inspect")) {
          return Response.json({ error: { message: "quota exceeded" } }, { status: 403 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    await expect(
      gscAnalyticsProvider.inspectUrl(
        { apiKey: "refresh_token", login: "sc-domain:example.com" },
        { property: "sc-domain:example.com", url: "https://example.com/page" },
      ),
    ).rejects.toThrow("quota exceeded");
  });

  it("maps Search Analytics 429 responses to ProviderRateLimitedError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes("/searchAnalytics/query")) {
          return Response.json({ error: { message: "Too many requests" } }, { status: 429 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const rejection = gscAnalyticsProvider.fetchQueryStats(
      { apiKey: "refresh_token", login: "sc-domain:example.com" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    await expect(rejection).rejects.toBeInstanceOf(ProviderRateLimitedError);
    await rejection.catch((error: unknown) => {
      expect(error).toMatchObject({ providerId: "gsc" });
    });
  });

  it("surfaces Search Analytics quotaExceeded 403 messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json(tokenResponse);
        }
        if (target.includes("/searchAnalytics/query")) {
          return Response.json(
            { error: { message: "Quota exceeded for search analytics requests" } },
            { status: 403 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const rejection = gscAnalyticsProvider.fetchQueryStats(
      { apiKey: "refresh_token", login: "sc-domain:example.com" },
      { endDate: "2026-07-03", startDate: "2026-07-01" },
    );

    await expect(rejection).rejects.toThrow("Quota exceeded for search analytics requests");
    await rejection.catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ProviderRateLimitedError);
    });
  });
});
