import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataForSeoProvider } from "./dataforseo";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function serpEnvelope(items: unknown[], cost = 0.0006) {
  return {
    cost,
    status_code: 20000,
    tasks: [{ cost, result: [{ items }], status_code: 20000 }],
  };
}

// Neutral, pre-resolved handles the runner hands the adapter (design §2.3). Country
// rows leave primaryGeoCode null (name path); city rows carry a numeric code.
function location(overrides: Partial<SerpRankLocation> = {}): SerpRankLocation {
  return {
    gl: "us",
    hl: "en",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
    ...overrides,
  };
}

function rankInput(
  input: {
    depth?: 10 | 20 | 50 | 100;
    domain?: string;
    location?: SerpRankLocation;
    password?: string;
    stopOnMatch?: boolean;
  } = {},
) {
  return {
    credentials: { login: "login", password: input.password ?? "secret" },
    depth: input.depth,
    device: "desktop" as const,
    domain: input.domain ?? "example.com",
    keyword: "rank tracker",
    location: input.location ?? location(),
    stopOnMatch: input.stopOnMatch,
  };
}

function abortError() {
  return Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}

const stopOnMatchParams = {
  find_targets_in: ["organic"],
  stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: "example.com" }],
};

describe("dataForSeoProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([10, 20, 50] as const)("sends the requested top-%i depth", async (depth) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(serpEnvelope([])));
    vi.stubGlobal("fetch", fetchMock);

    await dataForSeoProvider.fetchRank(rankInput({ depth }));

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([
      expect.objectContaining({ depth }),
    ]);
  });

  it("keeps the existing manual and legacy adapter on the Live endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(serpEnvelope([])));
    vi.stubGlobal("fetch", fetchMock);

    await dataForSeoProvider.fetchRank(rankInput());

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    );
  });

  it("parses the matching organic result position and ranking URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        serpEnvelope([
          { rank_absolute: 1, type: "paid", url: "https://ads.example.com" },
          { rank_absolute: 2, type: "people_also_ask" },
          {
            domain: "www.example.com",
            rank_absolute: 5,
            rank_group: 3,
            title: "Example result",
            type: "organic",
            url: "https://www.example.com/page",
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await dataForSeoProvider.fetchRank(
      rankInput({
        location: location({
          hl: "de",
          primaryGeoName: "Germany",
          secondaryGeoName: "Germany",
        }),
      }),
    );

    expect(result).toMatchObject({
      billingUnits: 1,
      costCents: 0.06,
      position: 3,
      rankingUrl: "https://www.example.com/page",
      raw: {
        organic_results: [
          {
            domain: "example.com",
            rank: 3,
            title: "Example result",
            url: "https://www.example.com/page",
          },
        ],
        serp_features: ["paid", "people also ask"],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Basic bG9naW46c2VjcmV0",
      "Content-Type": "application/json",
    });
    // Country row: no numeric code, so location_name is sent; language_code = hl.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([
      {
        depth: 100,
        device: "desktop",
        keyword: "rank tracker",
        language_code: "de",
        location_name: "Germany",
        ...stopOnMatchParams,
      },
    ]);
  });

  it("prefers the numeric location_code and sends language_code=hl for a resolved city", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(serpEnvelope([{ domain: "example.com", rank_absolute: 12, type: "organic" }])),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dataForSeoProvider.fetchRank(
        rankInput({
          depth: 50,
          location: location({
            primaryGeoCode: 1026339,
            primaryGeoName: "Austin,Texas,United States",
            secondaryGeoName: "Austin, Texas, United States",
          }),
        }),
      ),
    ).resolves.toMatchObject({ position: 12 });

    // City row: numeric location_code preferred over location_name.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([
      {
        depth: 50,
        device: "desktop",
        keyword: "rank tracker",
        language_code: "en",
        location_code: 1026339,
        ...stopOnMatchParams,
      },
    ]);
  });

  it("falls back to location_name when the resolved row has no numeric code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(serpEnvelope([{ domain: "example.com", rank_absolute: 12, type: "organic" }])),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dataForSeoProvider.fetchRank(
        rankInput({
          depth: 50,
          location: location({
            primaryGeoName: "United Kingdom",
            secondaryGeoName: "United Kingdom",
          }),
        }),
      ),
    ).resolves.toMatchObject({ position: 12 });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([
      {
        depth: 50,
        device: "desktop",
        keyword: "rank tracker",
        language_code: "en",
        location_name: "United Kingdom",
        ...stopOnMatchParams,
      },
    ]);
  });

  it("omits the stop target when stop on match is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(serpEnvelope([])));
    vi.stubGlobal("fetch", fetchMock);

    await dataForSeoProvider.fetchRank(rankInput({ stopOnMatch: false }));

    const [payload] = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).not.toHaveProperty("stop_crawl_on_match");
    expect(payload).not.toHaveProperty("find_targets_in");
  });

  it("returns null rank data when the domain is not in organic results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          serpEnvelope([
            { domain: "example.com", rank_group: 1, type: "local_pack" },
            { domain: "competitor.com", rank_group: 1, type: "organic" },
          ]),
        ),
      ),
    );

    await expect(dataForSeoProvider.fetchRank(rankInput())).resolves.toMatchObject({
      position: null,
      rankingUrl: null,
    });
  });

  it("falls back safely when an organic result contains a malformed domain URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            serpEnvelope([{ domain: "http://[invalid/path", rank_absolute: 1, type: "organic" }]),
          ),
        ),
    );
    await expect(dataForSeoProvider.fetchRank(rankInput())).resolves.toMatchObject({
      position: null,
      rankingUrl: null,
    });
  });

  it("uses the first matching organic result after normalizing www and subdomains", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          serpEnvelope([
            {
              domain: "blog.example.com",
              rank_absolute: 8,
              title: "First matching result",
              type: "organic",
              url: "https://blog.example.com/first",
            },
            {
              domain: "example.com",
              rank_absolute: 2,
              title: "Better rank but later",
              type: "organic",
              url: "https://example.com/later",
            },
          ]),
        ),
      ),
    );

    await expect(
      dataForSeoProvider.fetchRank(rankInput({ domain: "www.example.com" })),
    ).resolves.toMatchObject({
      position: 8,
      rankingUrl: "https://blog.example.com/first",
      raw: {
        organic_results: [
          {
            domain: "blog.example.com",
            rank: 8,
            title: "First matching result",
            url: "https://blog.example.com/first",
          },
          {
            domain: "example.com",
            rank: 2,
            title: "Better rank but later",
            url: "https://example.com/later",
          },
        ],
      },
    });
  });

  it("returns an empty raw payload when successful tasks have no result items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status_code: 20000,
          tasks: [{ cost: 0.0001, result: [{}], status_code: 20000 }],
        }),
      ),
    );

    await expect(dataForSeoProvider.fetchRank(rankInput())).resolves.toMatchObject({
      costCents: 0.01,
      position: null,
      rankingUrl: null,
      raw: { organic_results: [] },
    });
  });

  it("rejects malformed task items instead of returning an invalid rank", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(serpEnvelope([null]))));

    await expect(dataForSeoProvider.fetchRank(rankInput())).rejects.toThrow();
  });

  it("retries HTTP 429 responses before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status_message: "rate limited" }, 429))
      .mockResolvedValueOnce(
        jsonResponse(serpEnvelope([{ domain: "example.com", rank_absolute: 9, type: "organic" }])),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataForSeoProvider.fetchRank(rankInput())).resolves.toMatchObject({
      position: 9,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps final HTTP 429 responses to a DataForSEO rate-limit error message", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ status_message: "rate limit exceeded" }, 429)),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataForSeoProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "rate limit exceeded",
      name: "DataForSeoError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps HTTP 4xx responses to non-retryable DataForSEO errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status_message: "Unauthorized credentials" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataForSeoProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "Unauthorized credentials",
      name: "DataForSeoError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries HTTP 5xx responses and then fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ status_message: "temporary outage" }, 500)),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataForSeoProvider.fetchRank(rankInput())).rejects.toThrow("temporary outage");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps provider quota envelope codes to DataForSEO errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status_code: 40202,
          status_message: "Payment required.",
          tasks: [{ status_code: 40202, status_message: "Not enough credits." }],
        }),
      ),
    );

    await expect(dataForSeoProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "Not enough credits.",
      name: "DataForSeoError",
    });
  });

  it("retries fetch rejections and maps them to a DataForSEO request failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataForSeoProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "DataForSEO request failed.",
      name: "DataForSeoError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries once when the SERP request times out, then returns the rank", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce(
        jsonResponse(serpEnvelope([{ domain: "example.com", rank_absolute: 7, type: "organic" }])),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataForSeoProvider.fetchRank(rankInput())).resolves.toMatchObject({
      billingUnits: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails with a timeout error after one retry when the request keeps timing out", async () => {
    const fetchMock = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal("fetch", fetchMock);

    await expect(dataForSeoProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "DataForSEO request timed out.",
      name: "DataForSeoError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a 30s abort timeout for SERP rank checks and 10s for the connection test", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(serpEnvelope([]))));
    await dataForSeoProvider.fetchRank(rankInput());
    const serpDelays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(serpDelays).toContain(30_000);
    expect(serpDelays).not.toContain(10_000);

    setTimeoutSpy.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status_code: 20000, tasks: [] })),
    );
    await dataForSeoProvider.testConnection({ login: "login", password: "secret" });
    const testDelays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(testDelays).toContain(10_000);
    expect(testDelays).not.toContain(30_000);

    setTimeoutSpy.mockRestore();
  });

  it("redacts credential values from provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ status_message: "bad provider-secret credential" }, 500)),
        ),
    );

    let message = "";
    try {
      await dataForSeoProvider.fetchRank(rankInput({ password: "provider-secret" }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("[redacted]");
    expect(message).not.toContain("provider-secret");
  });

  it("tests connections with default messages and nested or top-level balances", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ status_code: 20000, tasks: [{ result: [{ money: 4.5 }] }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ balance: 2, status_code: 40000 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dataForSeoProvider.testConnection({ login: "login", password: "secret" }),
    ).resolves.toEqual({ balance: 4.5, message: "Connected.", ok: true });
    await expect(
      dataForSeoProvider.testConnection({ login: "login", password: "secret" }),
    ).resolves.toEqual({
      balance: 2,
      message: "DataForSEO connection test failed.",
      ok: false,
    });
  });

  it("returns a safe connection-test failure when credentials are missing", async () => {
    await expect(dataForSeoProvider.testConnection({})).resolves.toMatchObject({
      message: expect.any(String),
      ok: false,
    });
  });

  it("fetches one ranked-keyword page with a normalized domain and offset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        cost: 0.02,
        status_code: 20000,
        tasks: [
          {
            result: [
              {
                items: [
                  {
                    keyword_data: {
                      keyword: "rank tracker",
                      keyword_info: { search_volume: 500 },
                    },
                    ranked_serp_element: { serp_item: { etv: 12.4, rank_absolute: 4 } },
                  },
                ],
                total_count: 201,
              },
            ],
            status_code: 20000,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dataForSeoProvider.fetchRankedKeywords?.(
        { login: "login", password: "secret" },
        {
          domain: "https://www.Example.com/docs",
          limit: 100,
          location: location(),
          offset: 100,
        },
      ),
    ).resolves.toMatchObject({ costCents: 2, totalCount: 201 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([
      {
        language_code: "en",
        limit: 100,
        location_name: "United States",
        offset: 100,
        order_by: ["ranked_serp_element.serp_item.etv,desc"],
        target: "example.com",
      },
    ]);
  });

  it("degrades city locations to the country level for Labs lookups", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        cost: 0.02,
        status_code: 20000,
        tasks: [{ result: [{ items: [], total_count: 0 }], status_code: 20000 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await dataForSeoProvider.fetchRankedKeywords?.(
      { login: "login", password: "secret" },
      {
        domain: "example.com",
        limit: 100,
        location: location({
          primaryGeoCode: 1026339,
          primaryGeoName: "Austin,Texas,United States",
          secondaryGeoName: "Austin, Texas, United States",
        }),
        offset: 0,
      },
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([
      expect.objectContaining({
        language_code: "en",
        location_name: "United States",
      }),
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))[0]).not.toHaveProperty(
      "location_code",
    );
  });

  it("maps ranked-keyword HTTP 401 responses by status to reauthorization", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ status_message: "You are not authorized to access this resource" }, 401),
        ),
    );

    await expect(
      dataForSeoProvider.fetchRankedKeywords?.(
        { login: "login", password: "secret" },
        { domain: "example.com", limit: 100, location: location(), offset: 0 },
      ),
    ).rejects.toMatchObject({ name: "ProviderAuthError", providerId: "dataforseo" });
  });

  it("maps missing ranked-keyword credentials to reauthorization", async () => {
    await expect(
      dataForSeoProvider.fetchRankedKeywords?.(
        {},
        { domain: "example.com", limit: 100, location: location(), offset: 0 },
      ),
    ).rejects.toMatchObject({ name: "ProviderAuthError", providerId: "dataforseo" });
  });

  it("maps unsupported Labs locations to a typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status_code: 20000,
          tasks: [{ status_code: 40501, status_message: "Location is not supported." }],
        }),
      ),
    );

    await expect(
      dataForSeoProvider.fetchRankedKeywords?.(
        { login: "login", password: "secret" },
        { domain: "example.com", limit: 100, location: location(), offset: 0 },
      ),
    ).rejects.toMatchObject({ name: "DataForSeoUnsupportedLocationError" });
  });

  it("maps invalid Labs location fields to a typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status_code: 20000,
          tasks: [{ status_code: 40501, status_message: "Invalid Field: 'location_code'" }],
        }),
      ),
    );

    await expect(
      dataForSeoProvider.fetchRankedKeywords?.(
        { login: "login", password: "secret" },
        { domain: "example.com", limit: 100, location: location(), offset: 0 },
      ),
    ).rejects.toMatchObject({ name: "DataForSeoUnsupportedLocationError" });
  });

  it.each([
    ["fetchRelatedKeywords", "related_keywords", { depth: 3, keyword: "rank tracker" }],
    ["fetchKeywordSuggestions", "keyword_suggestions", { keyword: "rank tracker" }],
    ["fetchKeywordIdeas", "keyword_ideas", { keywords: ["rank tracker"] }],
  ] as const)("calls %s with Labs parameters", async (method, path, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        cost: 0.01,
        status_code: 20000,
        tasks: [{ result: [{ items: [] }], status_code: 20000 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const providerMethod = dataForSeoProvider[method];
    if (!providerMethod) throw new Error(`${method} is unavailable.`);

    await providerMethod(
      { login: "login", password: "secret" },
      {
        includeClickstream: true,
        limit: 300,
        location: location({
          primaryGeoCode: 1026339,
          primaryGeoName: "Austin,Texas,United States",
          secondaryGeoName: "Austin, Texas, United States",
        }),
        seed: "rank tracker",
      },
    );

    expect(fetchMock.mock.calls[0][0]).toContain(`/google/${path}/live`);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([
      {
        ...expected,
        include_clickstream_data: true,
        language_code: "en",
        limit: 300,
        location_name: "United States",
      },
    ]);
  });

  it("hydrates up to 700 metrics and maps HTTP 401 by status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          cost: 0.01,
          status_code: 20000,
          tasks: [{ result: [{ items: [] }], status_code: 20000 }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ status_message: "You are not authorized to access this resource" }, 401),
      );
    vi.stubGlobal("fetch", fetchMock);
    const metrics = dataForSeoProvider.fetchKeywordMetrics;
    if (!metrics) throw new Error("Metrics capability is unavailable.");

    await expect(
      metrics(
        { login: "login", password: "secret" },
        {
          includeClickstream: false,
          keywords: Array.from({ length: 701 }, (_, index) => `keyword ${index}`),
          location: location(),
        },
      ),
    ).rejects.toThrow("at most 700 keywords");
    expect(fetchMock).not.toHaveBeenCalled();

    await metrics(
      { login: "login", password: "secret" },
      {
        includeClickstream: false,
        keywords: Array.from({ length: 700 }, (_, index) => `keyword ${index}`),
        location: location(),
      },
    );
    const [payload] = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.keywords).toHaveLength(700);
    expect(payload).toMatchObject({
      include_clickstream_data: false,
      language_code: "en",
      location_name: "United States",
    });

    await expect(
      metrics(
        { login: "login", password: "secret" },
        { includeClickstream: false, keywords: ["rank tracker"], location: location() },
      ),
    ).rejects.toMatchObject({ name: "ProviderAuthError", providerId: "dataforseo" });
  });
});
