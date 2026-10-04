import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { type SerpRankLocation, serpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serpApiProvider } from "./serpapi";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function searchResponse(results: unknown[], extras: Record<string, unknown> = {}) {
  return {
    organic_results: results,
    search_metadata: { status: "Success" },
    serpapi_pagination: { next: "https://serpapi.com/search.json?start=10" },
    ...extras,
  };
}

// Neutral, pre-resolved handles the runner hands the adapter (design §2.3). SerpApi
// pins on secondaryGeoName + gl/hl; it never receives the numeric primary code.
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
    apiKey?: string;
    depth?: 10 | 20 | 50 | 100;
    device?: "desktop" | "mobile";
    domain?: string;
    location?: SerpRankLocation;
    stopOnMatch?: boolean;
  } = {},
) {
  return {
    credentials: { apiKey: input.apiKey ?? "serp-key" },
    depth: input.depth,
    device: input.device ?? ("desktop" as const),
    domain: input.domain ?? "example.com",
    keyword: "rank tracker",
    location: input.location ?? location(),
    stopOnMatch: input.stopOnMatch,
  };
}

describe("serpApiProvider", () => {
  it("keeps the original scope and next page for a short snapshot continuation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(searchResponse([{ link: "https://example.org/page", position: 1 }])),
        ),
    );
    const result = await serpApiProvider.fetchRank(rankInput({ depth: 10 }));
    expect(result.raw).toMatchObject({
      snapshotContinuation: {
        version: 1,
        nextStart: 10,
        ended: false,
        keyword: "rank tracker",
        domain: "example.com",
        device: "desktop",
        location: location(),
      },
    });
  });

  it("does not charge provider-cached searches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          searchResponse([{ link: "https://example.com/", position: 1 }], {
            search_metadata: { id: "cached-search", status: "Cached" },
          }),
        ),
      ),
    );
    const result = await serpApiProvider.fetchRank(rankInput({ depth: 20 }));
    expect(result.billingUnits).toBe(0);
  });

  it("counts a successful paid response even when its organic payload is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(searchResponse([{ link: "https://competitor.com/", position: 1 }])),
        )
        .mockResolvedValueOnce(jsonResponse({ search_metadata: { status: "Success" } })),
    );
    const result = await serpApiProvider.fetchRank(rankInput({ depth: 20 }));
    expect(result.billingUnits).toBe(2);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    [10, 1],
    [20, 2],
    [50, 5],
    [100, 10],
  ] as const)("uses %i-result depth across %i search request(s)", async (depth, requests) => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(searchResponse([{ link: "https://competitor.com/page", position: 1 }])),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(rankInput({ depth }));

    expect(fetchMock).toHaveBeenCalledTimes(requests);
    expect(result.billingUnits).toBe(requests);
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(String(url)).searchParams.get("nfpr")).toBe("1");
    }
  });

  it.each([20, 100] as const)(
    "stops at the actual final page even when top %i was requested",
    async (depth) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        jsonResponse(
          searchResponse([{ link: "https://competitor.com/", position: 1 }], {
            serpapi_pagination: undefined,
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const result = await serpApiProvider.fetchRank(rankInput({ depth }));
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        position: null,
        billingUnits: 1,
        observation: { completeness: "complete" },
      });
    },
  );

  it("allows a slow search page within the provider response window", async () => {
    vi.useFakeTimers();

    try {
      const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((resolve, reject) => {
          const timeout = setTimeout(
            () =>
              resolve(
                jsonResponse(
                  searchResponse([{ link: "https://www.example.com/page", position: 3 }]),
                ),
              ),
            42_000,
          );
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              reject(new DOMException("The operation was aborted.", "AbortError"));
            },
            { once: true },
          );
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = expect(
        serpApiProvider.fetchRank(rankInput({ depth: 10 })),
      ).resolves.toMatchObject({
        billingUnits: 1,
        position: 3,
      });

      await vi.advanceTimersByTimeAsync(42_000);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops after the first page when the tracked domain is found", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        searchResponse([
          {
            link: "https://www.example.com/first-page",
            position: 3,
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(rankInput({ depth: 100 }))).resolves.toMatchObject({
      billingUnits: 1,
      position: 3,
      rankingUrl: "https://www.example.com/first-page",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches the full requested depth when stop on match is disabled", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          searchResponse([
            {
              link: "https://www.example.com/first-page",
              position: 3,
            },
          ]),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      serpApiProvider.fetchRank(rankInput({ depth: 100, stopOnMatch: false })),
    ).resolves.toMatchObject({
      billingUnits: 10,
      position: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("parses the matching organic result position and ranking URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          searchResponse(
            [
              { link: "https://competitor.com/a", position: 1, title: "Competitor" },
              {
                displayed_link: "www.example.com",
                link: "https://www.example.com/page",
                position: 3,
                title: "Example result",
              },
            ],
            { answer_box: { title: "Answer" }, related_questions: [{ question: "Why?" }] },
          ),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(searchResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(
      rankInput({
        depth: 20,
        location: serpRankLocation({
          gl: "pl",
          hl: "pl",
          primaryGeoCode: null,
          primaryGeoName: "Poland",
          secondaryGeoName: "Poland",
        } as SerpRankLocation),
      }),
    );

    expect(result).toMatchObject({
      billingUnits: 1,
      costCents: 0,
      position: 3,
      rankingUrl: "https://www.example.com/page",
      raw: {
        organic_results: [
          {
            domain: "competitor.com",
            rank: 1,
            title: "Competitor",
            url: "https://competitor.com/a",
          },
          {
            domain: "example.com",
            rank: 3,
            title: "Example result",
            url: "https://www.example.com/page",
          },
        ],
        serp_features: ["answer box", "related questions"],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("https://serpapi.com/search.json");
    expect(requestedUrl).toContain("engine=google");
    expect(requestedUrl).toContain("api_key=serp-key");
    expect(requestedUrl).toContain("gl=pl");
    expect(requestedUrl).toContain("hl=pl");
    expect(requestedUrl).toContain("location=Poland");
    expect(requestedUrl).toBe(
      "https://serpapi.com/search.json?api_key=serp-key&device=desktop&engine=google&gl=pl&hl=pl&location=Poland&q=rank+tracker&nfpr=1",
    );
    expect(requestedUrl).not.toContain("num=");
    expect(requestedUrl).not.toContain("start=");
    // The geo pin is the canonical string only; never uule/lat/lon (design §2.3).
    expect(requestedUrl).not.toContain("uule=");
    expect(requestedUrl).not.toContain("lat=");
    expect(requestedUrl).not.toContain("lon=");
  });

  it("passes through a non-default market language", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(searchResponse([{ link: "https://example.com/page", position: 1 }])),
      );
    vi.stubGlobal("fetch", fetchMock);

    await serpApiProvider.fetchRank(
      rankInput({
        location: location({
          gl: "es",
          hl: "en",
          primaryGeoName: "Spain",
          secondaryGeoName: "Spain",
        }),
      }),
    );

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("gl=es");
    expect(requestedUrl).toContain("hl=en");
    expect(requestedUrl).toContain("location=Spain");
  });

  it("uses the first matching result after normalizing www and subdomains", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            searchResponse([
              {
                link: "https://blog.example.com/first",
                position: 4,
                title: "First matching result",
              },
              {
                displayed_link: "www.example.com",
                link: "https://www.example.com/later",
                position: 5,
                title: "Later matching result",
              },
            ]),
          ),
        )
        .mockResolvedValueOnce(jsonResponse(searchResponse([]))),
    );

    await expect(
      serpApiProvider.fetchRank(rankInput({ depth: 20, domain: "www.example.com" })),
    ).resolves.toMatchObject({
      position: 4,
      rankingUrl: "https://blog.example.com/first",
      raw: {
        organic_results: [
          {
            domain: "blog.example.com",
            rank: 4,
            title: "First matching result",
            url: "https://blog.example.com/first",
          },
          {
            domain: "example.com",
            rank: 5,
            title: "Later matching result",
            url: "https://www.example.com/later",
          },
        ],
      },
    });
  });

  it("preserves the requested mobile device", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        searchResponse([
          {
            displayed_link: "example.com",
            link: "https://example.com/mobile",
            position: 1,
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await serpApiProvider.fetchRank(rankInput({ device: "mobile", stopOnMatch: true }));

    expect(String(fetchMock.mock.calls[0][0])).toContain("device=mobile");
  });

  it("selects the minimum organic position across every matching URL on a page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          searchResponse([
            {
              link: "https://blog.example.com/first",
              position: 8,
            },
            {
              link: "https://example.com/best",
              position: 2,
            },
          ]),
        ),
      ),
    );

    await expect(serpApiProvider.fetchRank(rankInput())).resolves.toMatchObject({
      position: 2,
      rankingUrl: "https://example.com/best",
    });
  });

  it("rejects a matching organic item without a position", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        jsonResponse(
          searchResponse([
            {
              link: "https://example.com/missing-rank",
            },
          ]),
        ),
      ),
    );

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toMatchObject({
      anomalyCodes: ["organic_rank_missing"],
      name: "ProviderPayloadContractError",
    });
  });

  it("records but skips a malformed rank on a known nonmatching organic item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          searchResponse([
            {
              link: "https://competitor.example.org/missing-rank",
            },
            {
              link: "https://example.com/ranking",
              position: 3,
            },
          ]),
        ),
      ),
    );

    await expect(serpApiProvider.fetchRank(rankInput())).resolves.toMatchObject({
      position: 3,
      raw: {
        normalization: {
          anomalies: [{ code: "organic_rank_missing", index: 0 }],
          outcome: "match",
          version: "v2",
        },
      },
    });
  });

  it("pins on the canonical city string plus gl/hl for a resolved city location", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(searchResponse([{ link: "https://example.com/", position: 2 }])),
      )
      .mockResolvedValueOnce(jsonResponse(searchResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    await serpApiProvider.fetchRank(
      rankInput({
        depth: 20,
        location: serpRankLocation({
          // A city resolved for the code-based provider still carries a code, but
          // SerpApi ignores it and pins on the canonical secondaryGeoName string.
          gl: "us",
          hl: "en",
          primaryGeoCode: 1026339,
          primaryGeoName: "Austin,Texas,United States",
          secondaryGeoName: "Austin, Texas, United States",
        } as SerpRankLocation),
      }),
    );

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    // URLSearchParams uses application/x-www-form-urlencoded (spaces -> "+").
    const encodedLocation = new URLSearchParams({
      location: "Austin, Texas, United States",
    }).toString();
    expect(requestedUrl).toContain(encodedLocation);
    expect(requestedUrl).toContain("gl=us");
    expect(requestedUrl).toContain("hl=en");
    expect(requestedUrl).not.toContain("location_code=");
    expect(requestedUrl).not.toContain("uule=");
  });

  it("paginates deterministically to the requested depth and reports absolute ranks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(searchResponse([{ link: "https://competitor.com/1", position: 1 }])),
      )
      .mockResolvedValueOnce(
        jsonResponse(searchResponse([{ link: "https://competitor.com/2", position: 1 }])),
      )
      .mockResolvedValueOnce(
        jsonResponse(searchResponse([{ link: "https://competitor.com/3", position: 1 }])),
      )
      .mockResolvedValueOnce(
        jsonResponse(searchResponse([{ link: "https://competitor.com/4", position: 1 }])),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          searchResponse([
            {
              displayed_link: "example.com",
              link: "https://example.com/fifth-page",
              position: 7,
              title: "Fifth page result",
            },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(rankInput({ depth: 50 }));

    expect(result).toMatchObject({
      billingUnits: 5,
      position: 47,
      rankingUrl: "https://example.com/fifth-page",
      raw: {
        organic_results: [
          { domain: "competitor.com", rank: 1, title: null, url: "https://competitor.com/1" },
          { domain: "competitor.com", rank: 11, title: null, url: "https://competitor.com/2" },
          { domain: "competitor.com", rank: 21, title: null, url: "https://competitor.com/3" },
          { domain: "competitor.com", rank: 31, title: null, url: "https://competitor.com/4" },
          {
            domain: "example.com",
            rank: 47,
            title: "Fifth page result",
            url: "https://example.com/fifth-page",
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("start=");
    expect(String(fetchMock.mock.calls[1][0])).toContain("start=10");
    expect(String(fetchMock.mock.calls[2][0])).toContain("start=20");
    expect(String(fetchMock.mock.calls[3][0])).toContain("start=30");
    expect(String(fetchMock.mock.calls[4][0])).toContain("start=40");
  });

  it("rejects a matching malformed position even when another result is beyond depth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          searchResponse([
            { link: "https://example.com/zero", position: 0 },
            { link: "https://example.com/string-position", position: "2" },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(searchResponse([{ link: "https://example.com/deep", position: 11 }])),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(rankInput({ depth: 20 }))).rejects.toMatchObject({
      anomalyCodes: ["organic_rank_invalid"],
      name: "ProviderPayloadContractError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null rank data when the domain is not in organic results", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            searchResponse([
              { link: "https://competitor.com/", position: 1 },
              { link: "https://another.com/", position: 2 },
            ]),
          ),
        )
        .mockResolvedValueOnce(jsonResponse(searchResponse([]))),
    );

    await expect(serpApiProvider.fetchRank(rankInput({ depth: 20 }))).resolves.toMatchObject({
      billingUnits: 2,
      position: null,
      rankingUrl: null,
    });
  });

  it("rejects an unmeasured later page rather than returning a partial success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(searchResponse([{ link: "https://competitor.com/", position: 1 }])),
        )
        .mockResolvedValueOnce(jsonResponse({ search_metadata: {} })),
    );

    await expect(serpApiProvider.fetchRank(rankInput({ depth: 20 }))).rejects.toMatchObject({
      phase: "measurement",
      name: "ProviderUsagePersistenceError",
    });
  });

  it("throws on a malformed response missing organic results", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ search_metadata: { id: "native-malformed", status: "Success" } }),
        ),
    );

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toThrow(
      "did not include organic results",
    );
  });

  it("rejects null organic result entries instead of returning an invalid rank", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(searchResponse([null]))));

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toThrow();
  });

  it("throws when SerpApi reports an error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid API key" })));

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toThrow("Invalid API key");
  });

  it("maps final HTTP 429 responses to a SerpApi rate-limit error message", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ error: "Rate limit reached" }, 429)),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "Rate limit reached",
      name: "SerpApiError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps HTTP quota responses to non-retryable SerpApi errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Account quota exhausted" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "Account quota exhausted",
      name: "SerpApiError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not replay a search with an ambiguous transport failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toMatchObject({
      phase: "request",
      name: "ProviderUsagePersistenceError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("checks account balance and total capacity with the api_key query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        extra_credits: 6,
        plan_searches_left: 17,
        searches_per_month: 20,
        total_searches_left: 23,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.testConnection({ apiKey: "serp-key" })).resolves.toEqual({
      availabilityTotal: 26,
      balance: 23,
      message: "Connected.",
      ok: true,
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe("https://serpapi.com/account.json");
    expect(requestedUrl.searchParams.get("api_key")).toBe("serp-key");
  });

  it("uses monthly searches as capacity when extra credits are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ searches_per_month: 250, total_searches_left: 222 })),
    );

    await expect(serpApiProvider.testConnection({ apiKey: "serp-key" })).resolves.toEqual({
      availabilityTotal: 250,
      balance: 222,
      message: "Connected.",
      ok: true,
    });
  });

  it("keeps plan balance without inferring capacity and rejects invalid quota values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          extra_credits: -5,
          plan_searches_left: 17,
          searches_per_month: Number.POSITIVE_INFINITY,
          total_searches_left: -1,
        }),
      ),
    );

    await expect(serpApiProvider.testConnection({ apiKey: "serp-key" })).resolves.toEqual({
      balance: 17,
      message: "Connected.",
      ok: true,
    });
  });

  it("keeps successful connections backwards compatible when quota data is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(serpApiProvider.testConnection({ apiKey: "serp-key" })).resolves.toEqual({
      message: "Connected.",
      ok: true,
    });
  });

  it("redacts the api key from provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Quota for serp-secret-key exceeded" }, 401)),
    );

    let message = "";
    try {
      await serpApiProvider.fetchRank(rankInput({ apiKey: "serp-secret-key" }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("[redacted]");
    expect(message).not.toContain("serp-secret-key");
  });
});

describe("SerpApi observation capture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("records a complete local-results page with the requested client policy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          searchResponse([{ link: "https://competitor.example.com", position: 1 }], {
            local_results: { places: [{ place_id: "local", title: "Local result" }] },
          }),
        ),
      ),
    );

    const result = await serpApiProvider.fetchRank(rankInput({ depth: 10, stopOnMatch: false }));

    expect(result.observation).toMatchObject({
      completeness: "complete",
      items: [expect.objectContaining({ resultKind: "local_pack", title: "Local result" })],
      requestPolicy: {
        depth: 10,
        findTargetsIn: null,
        forcedAiOverview: false,
        stopOnMatch: false,
      },
    });
    expect(result.observation?.executedAt).toBe(result.checkedAt);
  });

  it("marks a client-side match break as truncated", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(searchResponse([{ link: "https://example.com/match", position: 1 }])),
        ),
    );

    const result = await serpApiProvider.fetchRank(rankInput({ depth: 20, stopOnMatch: true }));

    expect(result.observation?.completeness).toBe("truncated_by_stop_on_match");
  });

  it("leaves completeness unknown when a later requested page has no organic results", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(searchResponse([{ link: "https://competitor.example.com", position: 1 }])),
        )
        .mockResolvedValueOnce(jsonResponse({ search_metadata: { status: "Success" } })),
    );

    const result = await serpApiProvider.fetchRank(rankInput({ depth: 20, stopOnMatch: false }));

    expect(result.observation?.completeness).toBe("unknown");
  });
});

describe("SerpApi observation completeness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("records a complete observation when an armed policy fetches every requested page", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            searchResponse([
              { link: "https://competitor.example.org/first", position: 1, title: "Competitor" },
            ]),
          ),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(rankInput({ depth: 20, stopOnMatch: true }));

    expect(result.observation?.completeness).toBe("complete");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("records a truncated observation when the armed policy fires", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            searchResponse([{ link: "https://example.com/first", position: 1, title: "Example" }]),
          ),
        ),
    );

    const result = await serpApiProvider.fetchRank(rankInput({ depth: 20, stopOnMatch: true }));

    expect(result.observation?.completeness).toBe("truncated_by_stop_on_match");
  });

  it("records an unknown observation when a later requested page lacks organic results", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            searchResponse([
              { link: "https://competitor.example.org/first", position: 1, title: "Competitor" },
            ]),
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ search_metadata: { status: "Success" } })),
    );

    const result = await serpApiProvider.fetchRank(rankInput({ depth: 20, stopOnMatch: false }));

    expect(result.observation?.completeness).toBe("unknown");
  });
});

type JournalRow = Record<string, unknown> & { id: string };

function journalMatches(row: JournalRow, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") {
      return (value as Array<Record<string, unknown>>).some((clause) =>
        journalMatches(row, clause),
      );
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("notIn" in value) return !(value as { notIn: unknown[] }).notIn.includes(row[key]);
      if ("in" in value) return (value as { in: unknown[] }).in.includes(row[key]);
      if ("not" in value) return row[key] !== (value as { not: unknown }).not;
    }
    if (value === null) return row[key] == null;
    return row[key] === value;
  });
}

// Small persistent fake ledger: the real journal and transport run against it.
function createJournalLedger(seed: JournalRow[] = []) {
  const rows: JournalRow[] = seed.map((row) => ({ ...row }));
  const table = {
    findFirst: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) => journalMatches(row, where)) ?? null,
    ),
    createMany: vi.fn(async ({ data }: { data: JournalRow[] }) => {
      for (const entry of data) rows.push({ ...entry });
      return { count: data.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: JournalRow }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw Object.assign(new Error("Record not found."), { code: "P2025" });
      Object.assign(row, data);
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const victims = rows.filter((row) => journalMatches(row, where));
      for (const victim of victims) rows.splice(rows.indexOf(victim), 1);
      return { count: victims.length };
    }),
  };
  const db = {
    providerCostEntry: table,
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
  };
  return { db: db as unknown as PrismaClient, rows, table };
}

function journalRankInput(ledger: ReturnType<typeof createJournalLedger>, depth: 10 | 20 = 20) {
  const journal = createProviderRequestJournal(ledger.db, {
    attribution: {
      context: {
        correlationId: "corr-1",
        feature: "rank_check",
        projectId: "project_1",
        source: "app",
        trigger: "manual",
      },
      tag: "app=bisibility;stage=dev;src=app;trg=manual;f=rank_check;p=project_1;c=corr-1",
    },
    connectionId: "connection_1",
    projectId: "project_1",
    provider: "serpapi",
    unit: "units",
  });
  return {
    ...rankInput({ depth }),
    credentials: { apiKey: "serp-key", usageObserver: journal.observer },
  };
}

describe("SerpApi provider request journal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("makes no HTTP request when journal persistence of the begin row fails", async () => {
    const ledger = createJournalLedger();
    ledger.table.createMany.mockRejectedValue(new Error("ledger unavailable"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(journalRankInput(ledger))).rejects.toBeInstanceOf(
      ProviderUsagePersistenceError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ledger.rows).toEqual([]);
  });

  it("does not retry a paid request when settlement fails and keeps the unknown row", async () => {
    const ledger = createJournalLedger();
    ledger.table.update.mockRejectedValue(new Error("ledger unavailable"));
    // HTTP 500 would normally be retried; the persistence failure must win first.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Something went wrong" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(journalRankInput(ledger))).rejects.toBeInstanceOf(
      ProviderUsagePersistenceError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ledger.rows).toEqual([
      expect.objectContaining({ costCents: 0, measurementStatus: "unknown" }),
    ]);
  });

  it("preserves the first page receipt when a later page fails the run", async () => {
    const ledger = createJournalLedger();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          searchResponse([{ link: "https://competitor.com/", position: 1 }], {
            search_metadata: { id: "search-page-1", status: "Success" },
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "Account quota exhausted" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(journalRankInput(ledger))).rejects.toMatchObject({
      message: "Account quota exhausted",
      name: "SerpApiError",
    });

    const charged = ledger.rows.filter((row) => !row.failed);
    expect(charged).toEqual([
      expect.objectContaining({
        measurementStatus: "recorded",
        providerRequestId: "search-page-1",
        usageQuantity: 1,
      }),
    ]);
    expect(ledger.rows.filter((row) => row.failed)).toEqual([
      expect.objectContaining({ measurementStatus: "recorded", usageQuantity: 0 }),
    ]);
  });

  it("retains the charge when the logical rank check fails after a successful response", async () => {
    const ledger = createJournalLedger();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          searchResponse([{ link: "https://example.com/missing-rank" }], {
            search_metadata: { id: "search-contract", status: "Success" },
          }),
        ),
      ),
    );

    await expect(serpApiProvider.fetchRank(journalRankInput(ledger, 10))).rejects.toMatchObject({
      anomalyCodes: ["organic_rank_missing"],
      name: "ProviderPayloadContractError",
    });
    expect(ledger.rows).toEqual([
      expect.objectContaining({
        failed: false,
        measurementStatus: "recorded",
        providerRequestId: "search-contract",
        usageQuantity: 1,
      }),
    ]);
  });

  it("does not double-count a repeated provider request id across pages", async () => {
    const ledger = createJournalLedger();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          searchResponse([{ link: "https://competitor.com/1", position: 1 }], {
            search_metadata: { id: "search-dup", status: "Success" },
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          searchResponse([{ link: "https://competitor.com/2", position: 1 }], {
            search_metadata: { id: "search-dup", status: "Success" },
            serpapi_pagination: undefined,
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(journalRankInput(ledger));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.billingUnits).toBe(2);
    // Only one durable row survives; the duplicate attempt row is withdrawn.
    expect(ledger.rows).toEqual([
      expect.objectContaining({
        measurementStatus: "recorded",
        providerRequestId: "search-dup",
        usageQuantity: 1,
      }),
    ]);
  });

  it("keeps cached zero receipts distinct instead of deduplicating them", async () => {
    const ledger = createJournalLedger();
    const cachedPage = () =>
      jsonResponse(
        searchResponse([{ link: "https://competitor.com/", position: 1 }], {
          search_metadata: { id: "cached-search", status: "Cached" },
        }),
      );
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(cachedPage()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(journalRankInput(ledger));

    expect(result.billingUnits).toBe(0);
    expect(ledger.rows).toHaveLength(2);
    for (const row of ledger.rows) {
      expect(row).toMatchObject({
        cached: true,
        measurementStatus: "recorded",
        providerRequestId: undefined,
        usageQuantity: 0,
      });
    }
  });
});
