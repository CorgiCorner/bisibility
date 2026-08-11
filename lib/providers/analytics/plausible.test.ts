import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { classifyProviderFailure } from "@/lib/providers/failure-class";
import {
  clearProviderRateLimitState,
  ProviderRateLimitedError,
  providerAccountKey,
  readCooldown,
} from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plausibleAnalyticsProvider } from "./plausible";

// Endpoint validation resolves DNS for custom hostnames; keep tests hermetic
// and deterministic by resolving every name to a public address.
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "203.0.113.10" }]);
  return { default: { lookup }, lookup };
});

const credentials = { apiKey: "stats-token", login: "example.com" };

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

async function classifiedPageStatsFailure(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ error: `provider failure ${status}` }, status)),
  );

  try {
    await plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
      endDate: "2026-07-03",
      startDate: "2026-06-03",
    });
  } catch (error) {
    return classifyProviderFailure(error);
  }
  throw new Error("Expected Plausible page stats to fail.");
}

async function classifiedConfigurationFailure(input: typeof credentials & { endpoint?: string }) {
  try {
    await plausibleAnalyticsProvider.fetchPageStats?.(input, {
      endDate: "2026-07-03",
      startDate: "2026-06-03",
    });
  } catch (error) {
    return classifyProviderFailure(error);
  }
  throw new Error("Expected Plausible configuration validation to fail.");
}

describe("plausible analytics provider", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
    vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends the page stats query with auth, site id, filters, and pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { dimensions: ["/pricing"], metrics: [80, 40, 62.5, 91, 73] },
          { dimensions: [" "], metrics: [1, 1, 1, 1, 1] },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        limit: 25,
        startDate: "2026-06-03",
      }),
    ).resolves.toEqual([
      {
        bounceRate: 0.625,
        path: "/pricing",
        scrollDepth: 73,
        sessions: 40,
        visitDurationSeconds: 91,
        visitors: 80,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://plausible.io/api/v2/query",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer stats-token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    expect(requestBody()).toEqual({
      date_range: ["2026-06-03", "2026-07-03"],
      dimensions: ["event:page"],
      filters: [["is", "visit:channel", ["Organic Search"]]],
      metrics: ["visitors", "visits", "bounce_rate", "visit_duration", "scroll_depth"],
      pagination: { limit: 25 },
      site_id: "example.com",
    });
  });

  it("uses a custom endpoint and strips trailing slashes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await plausibleAnalyticsProvider.fetchPageStats?.(
      { ...credentials, endpoint: "https://stats.example.test///" },
      { endDate: "2026-07-03", startDate: "2026-06-03" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://stats.example.test/api/v2/query",
      expect.any(Object),
    );
  });

  it("rejects private-network endpoints before any request is sent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(
        { ...credentials, endpoint: "https://192.168.1.10:8000" },
        { endDate: "2026-07-03", startDate: "2026-06-03" },
      ),
    ).rejects.toThrow(/public http\(s\) URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies blocked endpoints and incomplete stored credentials as configuration errors", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      classifiedConfigurationFailure({ ...credentials, endpoint: "https://192.168.1.10:8000" }),
    ).resolves.toBe("config_invalid");
    await expect(classifiedConfigurationFailure({ ...credentials, login: " " })).resolves.toBe(
      "config_invalid",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-http endpoint protocols", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      plausibleAnalyticsProvider.testConnection({
        ...credentials,
        endpoint: "file:///etc/hosts",
      }),
    ).resolves.toMatchObject({ ok: false, message: expect.stringContaining("public http(s) URL") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows private-network endpoints for self-hosted deployments via env opt-in", async () => {
    vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_NETWORK", "1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await plausibleAnalyticsProvider.fetchPageStats?.(
      { ...credentials, endpoint: "https://192.168.1.10:8000" },
      { endDate: "2026-07-03", startDate: "2026-06-03" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://192.168.1.10:8000/api/v2/query",
      expect.any(Object),
    );
  });

  it("falls back to the hosted endpoint when no endpoint is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
      endDate: "2026-07-03",
      startDate: "2026-06-03",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://plausible.io/api/v2/query", expect.any(Object));
    expect(requestBody()).not.toHaveProperty("pagination");
  });

  it("returns empty page stats when Plausible omits results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        startDate: "2026-06-03",
      }),
    ).resolves.toEqual([]);
  });

  it("coerces partial metric rows and drops rows without a page path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { dimensions: ["/docs "], metrics: ["12", "not-a-number", "150", null, "0.8"] },
            { dimensions: [" "], metrics: ["9", "8", "7", "6", "5"] },
            { metrics: ["4", "3", "2", "1", "0"] },
          ],
        }),
      ),
    );

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        startDate: "2026-06-03",
      }),
    ).resolves.toEqual([
      {
        bounceRate: 1,
        path: "/docs",
        scrollDepth: 0.8,
        sessions: 0,
        visitDurationSeconds: undefined,
        visitors: 12,
      },
    ]);
  });

  it("retries without scroll_depth when an older server rejects that metric", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unknown metric scroll_depth" }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ dimensions: ["/docs"], metrics: [70, 35, 55, 44] }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        startDate: "2026-06-03",
      }),
    ).resolves.toEqual([
      {
        bounceRate: 0.55,
        path: "/docs",
        scrollDepth: undefined,
        sessions: 35,
        visitDurationSeconds: 44,
        visitors: 70,
      },
    ]);

    expect(requestBody(0).metrics).toContain("scroll_depth");
    expect(requestBody(1).metrics).toEqual(["visitors", "visits", "bounce_rate", "visit_duration"]);
  });

  it("writes a cooldown and defers on provider 429s", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "slow down" }, 429)));

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        startDate: "2026-06-03",
      }),
    ).rejects.toBeInstanceOf(ProviderRateLimitedError);

    const accountKey = providerAccountKey("plausible", credentials);
    expect(readCooldown(accountKey)?.until).toBeGreaterThan(Date.now());
  });

  it("classifies authorization failures as auth", async () => {
    await expect(classifiedPageStatsFailure(401)).resolves.toBe("auth");
  });

  it("classifies server failures as provider_5xx", async () => {
    await expect(classifiedPageStatsFailure(500)).resolves.toBe("provider_5xx");
  });

  it("maps HTTP 5xx payloads to PlausibleApiError with status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "backend down" } }, 500)),
    );

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        startDate: "2026-06-03",
      }),
    ).rejects.toMatchObject({
      message: "backend down",
      name: "PlausibleApiError",
      status: 500,
    });
  });

  it("rejects invalid JSON response bodies with PlausibleApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        startDate: "2026-06-03",
      }),
    ).rejects.toMatchObject({
      message: "Plausible API returned an invalid JSON body.",
      name: "PlausibleApiError",
      status: 200,
    });
  });

  it("propagates fetch rejections from the Plausible request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    await expect(
      plausibleAnalyticsProvider.fetchPageStats?.(credentials, {
        endDate: "2026-07-03",
        startDate: "2026-06-03",
      }),
    ).rejects.toThrow("network down");
  });

  it("tests connections with a one-day visitors query", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));

    await expect(plausibleAnalyticsProvider.testConnection(credentials)).resolves.toEqual({
      message: "Connection OK · example.com.",
      ok: true,
    });
    expect(requestBody()).toEqual({
      date_range: ["2026-07-04", "2026-07-04"],
      metrics: ["visitors"],
      site_id: "example.com",
    });
  });

  it("reports failed connection tests without calling live APIs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "forbidden" }, 403)));

    await expect(plausibleAnalyticsProvider.testConnection(credentials)).resolves.toEqual({
      message: "Provider plausible authorization is no longer valid. Reconnect the account.",
      ok: false,
    });
  });
});
