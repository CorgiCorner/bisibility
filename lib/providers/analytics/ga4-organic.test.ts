import { clearProviderRateLimitState } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDailyOrganicSessionsByLandingPage,
  fetchDailyOrganicSessionsTotals,
} from "./ga4-organic";

const token = { access_token: "access_token" };

describe("organic sessions reports", () => {
  beforeEach(() => {
    clearProviderRateLimitState();
    vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client_id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client_secret");
  });

  afterEach(() => {
    clearProviderRateLimitState();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks for date totals with the shared organic-search filter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({
          rows: [{ dimensionValues: [{ value: "20260701" }], metricValues: [{ value: "12" }] }],
        });
      }),
    );

    await expect(
      fetchDailyOrganicSessionsTotals({
        credentials: { apiKey: "refresh_token", login: "123" },
        endDate: "2026-07-03",
        startDate: "2026-07-01",
      }),
    ).resolves.toEqual([{ date: "2026-07-01", sessions: 12 }]);

    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes(":runReport"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      dateRanges: [{ endDate: "2026-07-03", startDate: "2026-07-01" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { value: "Organic Search" },
        },
      },
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });
  });

  it("normalizes valid rows and follows the offset through a full landing-page page", async () => {
    const reports = [
      {
        rows: [
          {
            dimensionValues: [{ value: "20260701" }, { value: "/pricing" }],
            metricValues: [{ value: "8" }, { value: "6" }, { value: "3" }],
          },
          {
            dimensionValues: [{ value: "20260701" }, { value: "(not set)" }],
            metricValues: [{ value: "4" }],
          },
        ],
      },
      {
        rows: [
          {
            dimensionValues: [{ value: "20260702" }, { value: "docs" }],
            metricValues: [{ value: "6" }, { value: "4" }, { value: "2" }],
          },
        ],
      },
    ];
    let report = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json(reports[report++]);
      }),
    );

    await expect(
      fetchDailyOrganicSessionsByLandingPage({
        credentials: { apiKey: "refresh_token", login: "123" },
        endDate: "2026-07-03",
        limit: 2,
        startDate: "2026-07-01",
      }),
    ).resolves.toEqual({
      capHit: false,
      pages: 2,
      requestedRows: 4,
      rows: [
        {
          date: "2026-07-01",
          engagedSessions: 6,
          keyEvents: 3,
          landingPage: "/pricing",
          sessions: 8,
        },
        {
          date: "2026-07-02",
          engagedSessions: 4,
          keyEvents: 2,
          landingPage: "docs",
          sessions: 6,
        },
      ],
    });

    const bodies = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes(":runReport"))
      .map(([, options]) => JSON.parse(String(options?.body)));
    expect(bodies).toEqual([
      {
        dateRanges: [{ endDate: "2026-07-03", startDate: "2026-07-01" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search" },
          },
        },
        dimensions: [{ name: "date" }, { name: "landingPage" }],
        limit: "2",
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
        offset: "0",
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
      {
        dateRanges: [{ endDate: "2026-07-03", startDate: "2026-07-01" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search" },
          },
        },
        dimensions: [{ name: "date" }, { name: "landingPage" }],
        limit: "2",
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
        offset: "2",
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    ]);
  });

  it("keeps unavailable landing-page metrics null and discards invalid dimensions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({
          rows: [
            {
              dimensionValues: [{ value: "20260701" }, { value: "/partial" }],
              metricValues: [{ value: "12" }],
            },
            {
              dimensionValues: [{ value: "20260701" }, { value: "/invalid" }],
              metricValues: [{ value: "13" }, { value: "" }, { value: "not-a-number" }],
            },
            {
              dimensionValues: [{ value: "20260701" }, { value: "/complete" }],
              metricValues: [{ value: "14" }, { value: "7" }, { value: "4" }],
            },
            {
              dimensionValues: [{ value: "2026-07-01" }, { value: "/bad-date" }],
              metricValues: [{ value: "15" }, { value: "8" }, { value: "5" }],
            },
            {
              dimensionValues: [{ value: "20260701" }, { value: "" }],
              metricValues: [{ value: "16" }, { value: "9" }, { value: "6" }],
            },
            {
              dimensionValues: [{ value: "20260701" }, { value: "(not set)" }],
              metricValues: [{ value: "17" }, { value: "10" }, { value: "7" }],
            },
          ],
        });
      }),
    );

    await expect(
      fetchDailyOrganicSessionsByLandingPage({
        credentials: { apiKey: "refresh_token", login: "123" },
        endDate: "2026-07-03",
        startDate: "2026-07-01",
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          date: "2026-07-01",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/partial",
          sessions: 12,
        },
        {
          date: "2026-07-01",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/invalid",
          sessions: 13,
        },
        {
          date: "2026-07-01",
          engagedSessions: 7,
          keyEvents: 4,
          landingPage: "/complete",
          sessions: 14,
        },
      ],
    });
  });

  it("clamps a caller's page bounds before issuing the report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({ rows: [] });
      }),
    );

    await fetchDailyOrganicSessionsByLandingPage({
      credentials: { apiKey: "refresh_token", login: "123" },
      endDate: "2026-07-03",
      limit: 0,
      offset: -1,
      startDate: "2026-07-01",
    });

    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes(":runReport"));
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ limit: "1", offset: "0" });
  });

  it("discards a surplus response row before continuing at the requested offset", async () => {
    const reports = [
      {
        rows: [
          {
            dimensionValues: [{ value: "20260701" }, { value: "/first" }],
            metricValues: [{ value: "1" }],
          },
          {
            dimensionValues: [{ value: "20260701" }, { value: "/second" }],
            metricValues: [{ value: "2" }],
          },
          {
            dimensionValues: [{ value: "20260701" }, { value: "/surplus" }],
            metricValues: [{ value: "99" }],
          },
        ],
      },
      {
        rows: [
          {
            dimensionValues: [{ value: "20260702" }, { value: "/third" }],
            metricValues: [{ value: "3" }],
          },
        ],
      },
    ];
    let report = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json(reports[report++]);
      }),
    );

    await expect(
      fetchDailyOrganicSessionsByLandingPage({
        credentials: { apiKey: "refresh_token", login: "123" },
        endDate: "2026-07-03",
        limit: 2,
        startDate: "2026-07-01",
      }),
    ).resolves.toMatchObject({
      pages: 2,
      rows: [
        {
          date: "2026-07-01",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/first",
          sessions: 1,
        },
        {
          date: "2026-07-01",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/second",
          sessions: 2,
        },
        {
          date: "2026-07-02",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/third",
          sessions: 3,
        },
      ],
    });

    const offsets = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes(":runReport"))
      .map(([, options]) => JSON.parse(String(options?.body)).offset);
    expect(offsets).toEqual(["0", "2"]);
  });

  it("reports when a full page stops at the provider row ceiling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({
          rows: [
            {
              dimensionValues: [{ value: "20260703" }, { value: "/docs" }],
              metricValues: [{ value: "6" }],
            },
          ],
        });
      }),
    );

    await expect(
      fetchDailyOrganicSessionsByLandingPage({
        credentials: { apiKey: "refresh_token", login: "123" },
        endDate: "2026-07-03",
        limit: 1,
        offset: 99_999,
        startDate: "2026-07-01",
      }),
    ).resolves.toEqual({
      capHit: true,
      pages: 1,
      requestedRows: 1,
      rows: [
        {
          date: "2026-07-03",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/docs",
          sessions: 6,
        },
      ],
    });
  });
});
