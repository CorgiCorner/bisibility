import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serpApiProvider } from "./serpapi";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function searchResponse(results: unknown[], extras: Record<string, unknown> = {}) {
  return { organic_results: results, search_metadata: { status: "Success" }, ...extras };
}

// Neutral, pre-resolved handles the runner hands the adapter (design §2.3). SerpAPI
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
    domain?: string;
    location?: SerpRankLocation;
    stopOnMatch?: boolean;
  } = {},
) {
  return {
    credentials: { apiKey: input.apiKey ?? "serp-key" },
    depth: input.depth,
    device: "desktop" as const,
    domain: input.domain ?? "example.com",
    keyword: "rank tracker",
    location: input.location ?? location(),
    stopOnMatch: input.stopOnMatch,
  };
}

describe("serpApiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    [10, 1],
    [20, 2],
    [50, 5],
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
        location: location({
          gl: "pl",
          hl: "pl",
          primaryGeoName: "Poland",
          secondaryGeoName: "Poland",
        }),
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
    expect(requestedUrl).not.toContain("num=");
    expect(requestedUrl).not.toContain("start=");
    // The geo pin is the canonical string only; never uule/lat/lon (design §2.3).
    expect(requestedUrl).not.toContain("uule=");
    expect(requestedUrl).not.toContain("lat=");
    expect(requestedUrl).not.toContain("lon=");
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
        location: location({
          // A city resolved for the code-based provider still carries a code, but
          // SerpAPI ignores it and pins on the canonical secondaryGeoName string.
          primaryGeoCode: 1026339,
          primaryGeoName: "Austin,Texas,United States",
          secondaryGeoName: "Austin, Texas, United States",
        }),
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

  it("ignores malformed positions and results beyond the requested depth", async () => {
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

    await expect(serpApiProvider.fetchRank(rankInput({ depth: 20 }))).resolves.toMatchObject({
      position: null,
      rankingUrl: null,
      raw: { organic_results: [] },
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

  it("treats later pages without organic results as exhausted pagination", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(searchResponse([{ link: "https://competitor.com/", position: 1 }])),
        )
        .mockResolvedValueOnce(jsonResponse({ search_metadata: {} })),
    );

    await expect(serpApiProvider.fetchRank(rankInput({ depth: 20 }))).resolves.toMatchObject({
      billingUnits: 1,
      position: null,
      rankingUrl: null,
    });
  });

  it("throws on a malformed response missing organic results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ search_metadata: {} })));

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toThrow(
      "did not include organic results",
    );
  });

  it("rejects null organic result entries instead of returning an invalid rank", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(searchResponse([null]))));

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toThrow();
  });

  it("throws when SerpAPI reports an error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid API key" })));

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toThrow("Invalid API key");
  });

  it("maps final HTTP 429 responses to a SerpAPI rate-limit error message", async () => {
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

  it("maps HTTP quota responses to non-retryable SerpAPI errors", async () => {
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

  it("retries fetch rejections and maps them to a SerpAPI request failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(rankInput())).rejects.toMatchObject({
      message: "SerpAPI request failed.",
      name: "SerpApiError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("checks account balance with the api_key query parameter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ plan_searches_left: 17, total_searches_left: 23 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.testConnection({ apiKey: "serp-key" })).resolves.toEqual({
      balance: 23,
      message: "Connected.",
      ok: true,
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe("https://serpapi.com/account.json");
    expect(requestedUrl.searchParams.get("api_key")).toBe("serp-key");
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
