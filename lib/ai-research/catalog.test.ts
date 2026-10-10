import { serpCountryCatalog } from "@/lib/serp/country-catalog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limiter = vi.hoisted(() => vi.fn());
const officialRates = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: limiter }));
vi.mock("./official-model-rates", () => ({ fetchOfficialModelRates: officialRates }));
vi.mock("@/lib/providers/serp/dataforseo-client", () => ({
  requireDataForSeoLogin: () => "Basic fictional-catalog-credentials",
}));

import {
  fetchAiResearchCapabilities,
  MODEL_CATALOG_PATH,
  PRICING_PATH,
  VISIBILITY_CATALOG_PATH,
} from "./catalog";

const credentials = { login: "fixture", password: "fictional-password" };
const models = [
  { model_name: "gpt-5-mini", reasoning: true, web_search_supported: true },
  { model_name: "gpt-4.1-nano", reasoning: false, web_search_supported: false },
];
const locations = [
  {
    location_code: 2840,
    location_name: "United States",
    available_languages: [
      {
        language_code: "en",
        language_name: "English",
        available_platforms: ["chat_gpt", "google"],
      },
    ],
  },
  {
    location_code: 2616,
    location_name: "Poland",
    available_languages: [
      { language_code: "pl", language_name: "Polish", available_platforms: ["google"] },
      { language_code: "en", language_name: "English", available_platforms: [] },
    ],
  },
];
const account = {
  login: "fixture-account@example.com",
  money: { balance: 123.45, total: 500 },
  rates: { statistics: { private_account_usage: "fictional" } },
  price: {
    ai_optimization: {
      llm_responses: { live: { priority_normal: [{ cost_type: "per_request", cost: 0.0006 }] } },
      llm_mentions: {
        search_mentions: {
          live: {
            priority_normal: [
              { cost_type: "per_request", cost: 0.1 },
              { cost_type: "per_result", cost: 0.001 },
            ],
          },
        },
      },
    },
  },
};
function envelope(result: unknown[]) {
  return {
    status_code: 20000,
    cost: 0,
    tasks_error: 0,
    tasks: [{ status_code: 20000, cost: 0, result }],
  };
}
function stubCatalog(mutate?: (payload: ReturnType<typeof envelope>, path: string) => unknown) {
  const fetch = vi.fn(async (url: string) => {
    const path = url.slice("https://api.dataforseo.com/v3/".length);
    const rows =
      path === MODEL_CATALOG_PATH
        ? models
        : path === VISIBILITY_CATALOG_PATH
          ? locations
          : [account];
    const payload = envelope(rows);
    return Response.json(mutate ? mutate(payload, path) : payload);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
beforeEach(() => {
  limiter.mockReset().mockResolvedValue({ success: true });
  officialRates.mockReset().mockResolvedValue(new Map());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("free provider AI capabilities", () => {
  it("uses only the three free GET metadata endpoints with bounded shared time", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetch = stubCatalog();
    await fetchAiResearchCapabilities(credentials);
    expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual(
      [MODEL_CATALOG_PATH, VISIBILITY_CATALOG_PATH, PRICING_PATH]
        .map((path) => `https://api.dataforseo.com/v3/${path}`)
        .sort(),
    );
    expect(limiter).toHaveBeenCalledTimes(3);
    for (const [, options] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(options.method ?? "GET").toBe("GET");
      expect(options.body).toBeUndefined();
      expect(options.cache).toBe("no-store");
      expect(options.redirect).toBe("error");
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(timeout).toHaveBeenCalledTimes(3);
    for (const [duration] of timeout.mock.calls) expect(duration).toBeGreaterThan(0);
    for (const [duration] of timeout.mock.calls) expect(duration).toBeLessThanOrEqual(10_000);
  });
  it("retains reasoning models and capabilities but never invents their total price", async () => {
    stubCatalog();
    const result = await fetchAiResearchCapabilities(credentials);
    expect(result.catalog.models).toEqual([
      expect.objectContaining({
        id: "gpt-5-mini",
        reasoning: true,
        webSearch: true,
        minOutputTokens: 1024,
        maxOutputTokens: 4096,
        priceAvailable: false,
      }),
      expect.objectContaining({
        id: "gpt-4.1-nano",
        reasoning: false,
        webSearch: false,
        minOutputTokens: 16,
        priceAvailable: false,
      }),
    ]);
    expect(result.promptBaseCostCents).toBe(0.06);
    expect(result.modelRates.size).toBe(0);
  });
  it("keeps official unit-price facts distinct from hard-cap and actual-cost eligibility", async () => {
    stubCatalog();
    const rate = {
      inputUsdPerMillion: 0.1,
      outputUsdPerMillion: 0.4,
      contextTokens: 1_047_576,
      maxOutputTokens: 32_768,
      checkedAt: new Date().toISOString(),
      sourceUrl: "https://developers.openai.com/_astro/pricing.fixture.js",
      limitsSourceUrl: "https://developers.openai.com/_astro/localization.react.fixture.js",
    };
    officialRates.mockResolvedValue(
      new Map([
        ["gpt-4.1-nano", rate],
        ["gpt-5-mini", rate],
        ["not-in-provider-catalog", rate],
      ]),
    );
    const result = await fetchAiResearchCapabilities(credentials);
    expect([...result.modelRates.keys()]).toEqual(["gpt-5-mini", "gpt-4.1-nano"]);
    expect(result.catalog.models.map(({ id, priceAvailable }) => ({ id, priceAvailable }))).toEqual(
      [
        { id: "gpt-5-mini", priceAvailable: true },
        { id: "gpt-4.1-nano", priceAvailable: true },
      ],
    );
  });
  it("does not claim hard-cap eligibility for fresh reasoning or snapshot prices", async () => {
    stubCatalog();
    const result = await fetchAiResearchCapabilities(credentials);
    expect(result.catalog.models.find((model) => model.id === "gpt-5-mini")?.admissionEnabled).toBe(
      false,
    );
  });
  it("exposes only the provider's actual platform, country and language combinations", async () => {
    stubCatalog();
    const { catalog } = await fetchAiResearchCapabilities(credentials);
    expect(catalog.visibilityMarkets).toEqual([
      {
        platform: "chat_gpt",
        locationCode: 2840,
        countryName: "United States",
        languages: [{ code: "en", name: "English" }],
      },
      {
        platform: "google",
        locationCode: 2840,
        countryName: "United States",
        languages: [{ code: "en", name: "English" }],
      },
      {
        platform: "google",
        locationCode: 2616,
        countryName: "Poland",
        languages: [{ code: "pl", name: "Polish" }],
      },
    ]);
    expect(
      catalog.visibilityMarkets.some(
        (market) => market.platform === "chat_gpt" && market.locationCode === 2616,
      ),
    ).toBe(false);
  });
  it("does not return account login, balances or usage statistics", async () => {
    stubCatalog();
    const result = await fetchAiResearchCapabilities(credentials);
    const serialized = JSON.stringify(result);
    for (const value of [account.login, "balance", "private_account_usage", "fictional-password"]) {
      expect(serialized).not.toContain(value);
    }
    expect(Object.keys(result)).not.toContain("money");
  });
  it("keeps bundled ISO search hints distinct from observed market coverage", async () => {
    stubCatalog();
    const { catalog } = await fetchAiResearchCapabilities(credentials);
    expect(catalog.responseCountries).toEqual(
      serpCountryCatalog.map((country) => ({
        code: country.countryCode,
        name: country.displayName,
      })),
    );
    expect(catalog.visibilityMarkets.some((market) => market.countryName === "France")).toBe(false);
    expect(catalog.responseCountries.every((country) => /^[A-Z]{2}$/.test(country.code))).toBe(
      true,
    );
  });
  it.each(["declared_size", "http_failure"])("cancels unread metadata bodies: %s", async (kind) => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          () =>
            new Response(
              new ReadableStream({ cancel }),
              kind === "http_failure"
                ? { status: 503 }
                : { headers: { "content-length": "2097153" } },
            ),
        ),
    );
    await expect(fetchAiResearchCapabilities(credentials)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(3);
  });
  it("clamps metadata timeouts to the remaining aggregate deadline", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    stubCatalog();
    await fetchAiResearchCapabilities(credentials, Date.now() + 2000);
    for (const [duration] of timeout.mock.calls) expect(duration).toBeLessThanOrEqual(2000);
  });
  it("rejects expired deadlines without a network request", async () => {
    const fetch = stubCatalog();
    await expect(fetchAiResearchCapabilities(credentials, Date.now())).rejects.toThrow("deadline");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("honors account rate limits before fetching metadata", async () => {
    limiter.mockResolvedValue({ success: false });
    const fetch = stubCatalog();
    await expect(fetchAiResearchCapabilities(credentials)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects HTTP failures without starting any paid endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchAiResearchCapabilities(credentials)).rejects.toMatchObject({ costCents: 0 });
    expect(fetch.mock.calls.every(([url]) => !String(url).endsWith("/live"))).toBe(true);
  });
  it.each(["top_cost", "task_cost", "task_error", "status", "task_status"])(
    "rejects invalid free metadata envelopes: %s",
    async (failure) => {
      stubCatalog((payload) => {
        if (failure === "top_cost") return { ...payload, cost: 0.01 };
        if (failure === "task_cost") payload.tasks[0].cost = 0.01;
        if (failure === "task_error") payload.tasks_error = 1;
        if (failure === "status") payload.status_code = 50000;
        if (failure === "task_status") payload.tasks[0].status_code = 50000;
        return payload;
      });
      await expect(fetchAiResearchCapabilities(credentials)).rejects.toThrow(
        "invalid free catalog",
      );
    },
  );
  it("rejects an invalid model capability instead of treating it as runnable", async () => {
    stubCatalog((payload, path) =>
      path === MODEL_CATALOG_PATH
        ? envelope([{ model_name: "", reasoning: "unknown", web_search_supported: true }])
        : payload,
    );
    await expect(fetchAiResearchCapabilities(credentials)).rejects.toThrow();
  });
  it.each(["declared", "streamed"])("rejects metadata larger than 2 MiB: %s", async (kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Response("x".repeat(2 * 1024 * 1024 + 1), {
            headers: kind === "declared" ? { "content-length": String(2 * 1024 * 1024 + 1) } : {},
          }),
      ),
    );
    await expect(fetchAiResearchCapabilities(credentials)).rejects.toThrow("size limit");
  });
  it("cancels oversized streaming responses immediately", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
              },
              cancel,
            }),
          ),
      ),
    );
    await expect(fetchAiResearchCapabilities(credentials)).rejects.toThrow("size limit");
    expect(cancel).toHaveBeenCalledTimes(3);
  });
});
