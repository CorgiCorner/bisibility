import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { PLAUSIBLE_ORGANIC_SEARCH_FILTER } from "@/lib/providers/analytics/plausible";
import { clearProviderRateLimitState } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlausibleGoalConversions,
  PLAUSIBLE_GOAL_DIMENSIONS,
  PLAUSIBLE_GOAL_PAGE_LIMIT,
  PlausibleGoalParseError,
  parsePlausibleGoalResults,
  plausibleGoalQuery,
} from "./plausible-goals";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "203.0.113.10" }]);
  return { default: { lookup }, lookup };
});

const credentials = { apiKey: "stats-token", login: "example.com" };

const successBody = {
  meta: { imports_included: false },
  query: { site_id: "example.com" },
  results: [
    {
      dimensions: ["Signup", "/pricing", "2026-03-01"],
      metrics: [4, 3, { currency: "USD", long: "$12.50", short: "$12.50", value: 12.5 }],
    },
  ],
};

const pageBody = (goal: string, page: string) => ({
  results: [{ dimensions: [goal, page, "2026-03-02"], metrics: [1, 1, null] }],
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function requestBody(callIndex = 0) {
  const init = vi.mocked(fetch).mock.calls[callIndex]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("plausible goal query", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("builds an organic goal breakdown with a 5000-row page", () => {
    expect(
      plausibleGoalQuery({
        endDate: "2026-03-28",
        includeRevenue: true,
        limit: PLAUSIBLE_GOAL_PAGE_LIMIT,
        offset: 0,
        startDate: "2026-02-22",
      }),
    ).toEqual({
      date_range: ["2026-02-22", "2026-03-28"],
      dimensions: PLAUSIBLE_GOAL_DIMENSIONS,
      filters: PLAUSIBLE_ORGANIC_SEARCH_FILTER,
      metrics: ["events", "visitors", "total_revenue"],
      pagination: { limit: 5000, offset: 0 },
    });
  });

  it("parses a documented results body and keeps revenue currency", () => {
    expect(parsePlausibleGoalResults(successBody, true)).toEqual([
      {
        date: "2026-03-01",
        entryPage: "/pricing",
        events: 4,
        goal: "Signup",
        revenue: { currency: "USD", minor: 1250n },
      },
    ]);
  });

  it("rejects a body that is not the documented results shape", () => {
    expect(() => parsePlausibleGoalResults({ rows: [] }, false)).toThrow(PlausibleGoalParseError);
  });

  it("sends the goal query with the shared auth, site and timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchPlausibleGoalConversions(credentials, {
        endDate: "2026-03-01",
        startDate: "2026-03-01",
      }),
    ).resolves.toEqual({ revenueSupported: true, rows: [], truncated: false });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://plausible.io/api/v2/query",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer stats-token",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(requestBody()).toMatchObject({
      filters: PLAUSIBLE_ORGANIC_SEARCH_FILTER,
      pagination: { limit: 5000, offset: 0 },
      site_id: "example.com",
    });
  });

  it("uses a self-hosted base URL without a trailing slash", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    await fetchPlausibleGoalConversions(
      { ...credentials, endpoint: "https://stats.example.test///" },
      { endDate: "2026-03-01", startDate: "2026-03-01" },
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://stats.example.test/api/v2/query",
      expect.any(Object),
    );
  });

  it("pages until a short page and stops as truncated at the page cap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pageBody("Signup", "/pricing")))
      .mockResolvedValueOnce(jsonResponse(pageBody("Trial started", "/docs")))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchPlausibleGoalConversions(
        credentials,
        { endDate: "2026-03-02", startDate: "2026-03-02" },
        { pageLimit: 1 },
      ),
    ).resolves.toMatchObject({
      rows: [{ goal: "Signup" }, { goal: "Trial started" }],
      truncated: false,
    });
    expect(requestBody(1)).toMatchObject({ pagination: { limit: 1, offset: 1 } });

    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockResolvedValue(jsonResponse(pageBody("Signup", "/pricing")));
    await expect(
      fetchPlausibleGoalConversions(
        credentials,
        { endDate: "2026-03-02", startDate: "2026-03-02" },
        { maxPages: 1, pageLimit: 1 },
      ),
    ).resolves.toMatchObject({ truncated: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("maps an error body without echoing the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid filters for this site" }, 400)),
    );
    await expect(
      fetchPlausibleGoalConversions(credentials, {
        endDate: "2026-03-01",
        startDate: "2026-03-01",
      }),
    ).rejects.toThrow(/Invalid filters/);
    await expect(
      fetchPlausibleGoalConversions(credentials, {
        endDate: "2026-03-01",
        startDate: "2026-03-01",
      }).catch((error: Error) => error.message),
    ).resolves.not.toContain("stats-token");
  });

  it("drops total_revenue when the API rejects that metric and leaves revenue null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid metrics: ["total_revenue"]' }, 400))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ dimensions: ["Signup", "/pricing", "2026-03-01"], metrics: [2, 2] }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchPlausibleGoalConversions(credentials, {
        endDate: "2026-03-01",
        startDate: "2026-03-01",
      }),
    ).resolves.toEqual({
      revenueSupported: false,
      rows: [
        {
          date: "2026-03-01",
          entryPage: "/pricing",
          events: 2,
          goal: "Signup",
          revenue: null,
        },
      ],
      truncated: false,
    });
    expect(requestBody(1).metrics).toEqual(["events", "visitors"]);
  });

  it("rejects a private-network endpoint before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchPlausibleGoalConversions(
        { ...credentials, endpoint: "https://192.168.1.10:8000" },
        { endDate: "2026-03-01", startDate: "2026-03-01" },
      ),
    ).rejects.toThrow(/public http\(s\) URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
