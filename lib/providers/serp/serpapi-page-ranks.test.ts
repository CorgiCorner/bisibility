import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import { serpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serpApiProvider } from "./serpapi";
import { serpApiPageCoverage } from "./serpapi-page-coverage";
import { serpApiOrganicCandidates } from "./serpapi-payload";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

/** SerpApi numbers `position` from 1 on every page, whatever `start` was requested. */
function page(count: number, prefix: string, overrides: Record<number, unknown> = {}) {
  return {
    organic_results: Array.from({ length: count }, (_, index) => ({
      link: `https://${prefix}${index + 1}.example.org/`,
      position: index + 1,
      title: `${prefix} ${index + 1}`,
      ...(overrides[index + 1] as object | undefined),
    })),
    search_metadata: { status: "Success" },
    serpapi_pagination: { next: "next-page" },
  };
}

function input(depth: 10 | 20 | 50 | 100 = 20) {
  return {
    credentials: { apiKey: "serp-key", usageObserver: testUsageObserver },
    depth,
    device: "desktop" as const,
    domain: "example.com",
    keyword: "rank tracker",
    location: serpRankLocation({
      gl: "us",
      hl: "en",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    }),
    stopOnMatch: false,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("SerpApi organic rank numbering across pages", () => {
  it("numbers page 2 continuously when page 1 returned only 9 organic results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(9, "a")))
      .mockResolvedValueOnce(
        jsonResponse(page(10, "b", { 3: { link: "https://www.example.com/target" } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(input());

    expect(String(fetchMock.mock.calls[1][0])).toContain("start=10");
    expect(result.raw?.organic_results?.map((row) => row.rank)).toEqual(
      Array.from({ length: 19 }, (_, index) => index + 1),
    );
    expect(result.position).toBe(12);
    expect(result.rankingUrl).toBe("https://www.example.com/target");
    expect(result.observation?.completeness).toBe("unknown");
  });

  it("keeps ranks 11-20 on page 2 when page 1 returned a full ten", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(10, "a")))
      .mockResolvedValueOnce(
        jsonResponse(page(10, "b", { 3: { link: "https://www.example.com/target" } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(input());

    expect(result.raw?.organic_results?.map((row) => row.rank)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(result.position).toBe(13);
  });

  it("carries the cumulative organic count of every earlier page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(9, "a")))
      .mockResolvedValueOnce(jsonResponse(page(8, "b")))
      .mockResolvedValueOnce(
        jsonResponse(page(10, "c", { 2: { link: "https://www.example.com/deep" } })),
      )
      .mockImplementation((url: string) =>
        Promise.resolve(jsonResponse(page(10, `d${new URL(url).searchParams.get("start")}`))),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(input(100));

    expect(String(fetchMock.mock.calls[2][0])).toContain("start=20");
    expect(result.position).toBe(19);
  });

  it("records the real organic count when a trailing redirect row is not stored", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          page(10, "a", {
            2: { link: "https://www.example.com/target" },
            10: { link: "https://www.google.com/url?q=https%3A%2F%2Fexample.net%2Fhidden" },
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(page(10, "b")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank({ ...input(20), stopOnMatch: false });

    expect(result.position).toBe(2);
    expect(result.raw?.organic_results).toHaveLength(19);
    expect(result.raw?.snapshotContinuation).toMatchObject({ nextStart: 20, organicReturned: 20 });
  });

  it("still fails closed on a page-2 match without a usable position", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(page(9, "a")))
        .mockResolvedValueOnce(
          jsonResponse(
            page(10, "b", { 3: { link: "https://www.example.com/target", position: undefined } }),
          ),
        ),
    );

    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow();
  });

  it("offsets candidate ranks by the earlier organic count, not a nominal start", () => {
    const rows = [{ link: "https://one.example.org/", position: 1 }];
    expect(serpApiOrganicCandidates(rows, 9)[0]?.rank).toBe(10);
    expect(
      serpApiOrganicCandidates([{ link: "https://x.example.org/" }], 9)[0]?.rank,
    ).toBeUndefined();
  });
});

describe("SerpApi organic depth coverage within the admitted page budget", () => {
  it.each([false, true])(
    "rejects a 19-row miss at depth 20 (stopOnMatch: %s)",
    async (stopOnMatch) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(page(9, "a")))
        .mockResolvedValueOnce(jsonResponse(page(10, "b")))
        .mockResolvedValueOnce(
          jsonResponse(page(10, "c", { 1: { link: "https://example.com/target" } })),
        );
      vi.stubGlobal("fetch", fetchMock);

      await expect(serpApiProvider.fetchRank({ ...input(), stopOnMatch })).rejects.toMatchObject({
        message: expect.stringContaining("organic_depth_not_covered"),
        retryable: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps a completed miss when the organic prefix covers depth 20", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(10, "a")))
      .mockResolvedValueOnce(jsonResponse(page(10, "b")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(input());
    expect(result).toMatchObject({
      position: null,
      billingUnits: 2,
      raw: { normalization: { outcome: "no_match" } },
      observation: { completeness: "complete" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows an exhausted provider to prove a miss below the requested depth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(9, "a")))
      .mockResolvedValueOnce(jsonResponse({ ...page(10, "b"), serpapi_pagination: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank(input());
    expect(result).toMatchObject({
      position: null,
      billingUnits: 2,
      raw: {
        normalization: { outcome: "no_match" },
        snapshotContinuation: { ended: true, organicReturned: 19 },
      },
      observation: { completeness: "complete" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not use ads or other result types to fill an organic gap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(9, "a")))
      .mockResolvedValueOnce(
        jsonResponse({
          ...page(10, "b"),
          ads: [{ link: "https://example.com/ad", position: 1 }],
          top_stories: [{ link: "https://example.com/story", position: 1 }],
          local_results: { places: [{ link: "https://example.com/place", position: 1 }] },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { serpapi_pagination: { next: "next-page" } },
    { serpapi_pagination: { next_link: "next-page" } },
    { serpapi_pagination: {}, pagination: { next: "next-page" } },
  ])("does not treat an empty page with continuation %j as exhaustion", async (pagination) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(9, "a")))
      .mockResolvedValueOnce(jsonResponse({ ...page(0, "b"), ...pagination }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an uncovered rank beyond the collected organic rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(9, "a")))
      .mockResolvedValueOnce(
        jsonResponse(page(1, "b", { 1: { link: "https://example.com/target", position: 10 } })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not infer exhaustion from a missing later organic payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(9, "a")))
      .mockResolvedValueOnce(jsonResponse({ search_metadata: { status: "Success" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses proven exhaustion before an early match beyond the collected rows", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ...page(1, "a", { 1: { link: "https://example.com/target", position: 4 } }),
        serpapi_pagination: {},
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.fetchRank({ ...input(), stopOnMatch: true });
    expect(result).toMatchObject({ position: 4, raw: { snapshotContinuation: { ended: true } } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("SerpApi page progression", () => {
  it.each([20, 50, 100] as const)(
    "rejects a repeated native page at depth %s without another request",
    async (depth) => {
      const repeated = {
        ...page(10, "a"),
        search_metadata: { id: "same-search", status: "Success" },
      };
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(repeated)));
      vi.stubGlobal("fetch", fetchMock);
      await expect(serpApiProvider.fetchRank(input(depth))).rejects.toThrow(
        "organic_depth_not_covered",
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each([false, true])(
    "rejects overlapping pages before accepting a later target (stopOnMatch %s)",
    async (stopOnMatch) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(page(10, "a")))
        .mockResolvedValueOnce(
          jsonResponse(
            page(10, "b", {
              1: { link: "https://a10.example.org/" },
              3: { link: "https://example.com/target" },
            }),
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      await expect(serpApiProvider.fetchRank({ ...input(), stopOnMatch })).rejects.toThrow(
        "organic_depth_not_covered",
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects identical rows without a native identity", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(page(10, "a"))));
    vi.stubGlobal("fetch", fetchMock);
    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects reused native identity even with different rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...page(10, "a"),
          search_metadata: { id: "same-search", status: "Success" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...page(10, "b"),
          search_metadata: { id: "same-search", status: "Success" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([0, 5])("rejects a reported start offset of %s on the second page", async (start) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...page(10, "a"), search_parameters: { start: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ ...page(10, "b"), search_parameters: { start } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([0, 5, 10, "invalid"])(
    "rejects a non-advancing continuation offset %s",
    async (nextStart) => {
      const first = { ...page(10, "a"), search_parameters: { start: 0 } };
      const second = {
        ...page(10, "b"),
        search_parameters: { start: 10 },
        serpapi_pagination: { next: `https://serpapi.com/search.json?start=${nextStart}` },
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(first))
        .mockResolvedValueOnce(jsonResponse(second));
      vi.stubGlobal("fetch", fetchMock);
      await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects duplicate positions within a page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(10, "a", { 10: { position: 9 } })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(serpApiProvider.fetchRank(input(10))).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts distinct URLs on one domain with progressing native offsets", async () => {
    const pages = [0, 10].map((start) => ({
      ...page(10, `p${start}`),
      organic_results: Array.from({ length: 10 }, (_, index) => ({
        link: `https://other.example.org/${start + index}`,
        position: index + 1,
      })),
      search_metadata: { id: `search-${start}`, status: "Success" },
      search_parameters: { start },
      serpapi_pagination: { next: `https://serpapi.com/search.json?start=${start + 10}` },
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pages[0]))
      .mockResolvedValueOnce(jsonResponse(pages[1]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await serpApiProvider.fetchRank(input());
    expect(result).toMatchObject({ position: null, observation: { completeness: "complete" } });
    expect(result.raw?.organic_results).toHaveLength(20);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

it("requires monotonically increasing requested page starts", () => {
  const accept = serpApiPageCoverage();
  accept({}, 0, []);
  expect(() => accept({}, 0, [])).toThrow("organic_depth_not_covered");
});
it.each([
  { serpapi_pagination: { next: "https://[invalid" } },
  { serpapi_pagination: { next_link: "https://serpapi.com/search.json?start=0" } },
  { pagination: { next: "https://serpapi.com/search.json?start=0" } },
])("rejects invalid or non-advancing continuation fields %j", async (pagination) => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ ...page(10, "a"), serpapi_pagination: undefined, ...pagination }),
    );
  vi.stubGlobal("fetch", fetchMock);
  await expect(serpApiProvider.fetchRank(input(10))).rejects.toThrow("organic_depth_not_covered");
  expect(fetchMock).toHaveBeenCalledOnce();
});

describe("SerpApi continuous organic prefix", () => {
  function nativePage(start: number, positions: number[], exhausted = false) {
    return {
      organic_results: positions.map((position, index) => ({
        link: `https://other.example.org/${start}/${index}`,
        position,
      })),
      search_metadata: { id: `page-${start}`, status: "Success" },
      search_parameters: { start },
      serpapi_pagination: exhausted
        ? {}
        : { next: `https://serpapi.com/search.json?start=${start + 10}` },
    };
  }
  const ten = Array.from({ length: 10 }, (_, index) => index + 1);
  const gapAtEnd = [...ten.slice(0, 9), 11];

  it.each([false, true])("rejects full-count rank gaps (stopOnMatch %s)", async (stopOnMatch) => {
    for (const positions of [ten, ten.map((rank) => rank + 10)]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(nativePage(0, gapAtEnd)))
        .mockResolvedValueOnce(jsonResponse(nativePage(10, positions)));
      vi.stubGlobal("fetch", fetchMock);
      await expect(serpApiProvider.fetchRank({ ...input(), stopOnMatch })).rejects.toMatchObject({
        name: "OrganicCoverageError",
        code: "organic_depth_not_covered",
        retryable: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it.each([false, true])("rejects depth-10 boundary gaps (stopOnMatch %s)", async (stopOnMatch) => {
    for (const positions of [gapAtEnd, ten.map((rank) => rank + 1)]) {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(nativePage(0, positions)));
      vi.stubGlobal("fetch", fetchMock);
      await expect(serpApiProvider.fetchRank({ ...input(10), stopOnMatch })).rejects.toMatchObject({
        name: "OrganicCoverageError",
        code: "organic_depth_not_covered",
        retryable: false,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  });

  it("rejects duplicate absolute ranks across distinct pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(nativePage(0, [...ten, 11])))
      .mockResolvedValueOnce(
        jsonResponse(
          nativePage(
            10,
            ten.map((rank) => rank + 10),
          ),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(serpApiProvider.fetchRank(input())).rejects.toThrow("organic_depth_not_covered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, 0, -1, 1.5, "10"])("rejects unusable native rank %s", async (position) => {
    const data = page(10, "invalid", { 10: { position } });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(data));
    vi.stubGlobal("fetch", fetchMock);
    await expect(serpApiProvider.fetchRank(input(10))).rejects.toMatchObject({
      name: "OrganicCoverageError",
      code: "organic_depth_not_covered",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not turn invalid local positions into covered absolute ranks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(nativePage(0, [...ten.slice(0, 8), 19, 20])))
      .mockResolvedValueOnce(jsonResponse(nativePage(10, [-1, 0, ...ten.slice(0, 8)])));
    vi.stubGlobal("fetch", fetchMock);
    await expect(serpApiProvider.fetchRank(input())).rejects.toMatchObject({
      name: "OrganicCoverageError",
      code: "organic_depth_not_covered",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps native absolute ranks through the validated page start", async () => {
    const second = nativePage(
      10,
      ten.map((rank) => rank + 10),
    );
    second.organic_results[2].link = "https://example.com/target";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(nativePage(0, ten)))
      .mockResolvedValueOnce(jsonResponse(second));
    vi.stubGlobal("fetch", fetchMock);
    const result = await serpApiProvider.fetchRank(input());
    expect(result).toMatchObject({ position: 13, observation: { completeness: "complete" } });
    expect(result.raw?.organic_results?.map((row) => row.rank)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows proven exhaustion despite a gap", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(nativePage(0, gapAtEnd, true)));
    vi.stubGlobal("fetch", fetchMock);
    const result = await serpApiProvider.fetchRank(input(10));
    expect(result).toMatchObject({ position: null, observation: { completeness: "complete" } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "rejects a positive beyond a gap (stopOnMatch %s)",
    async (stopOnMatch) => {
      const data = nativePage(
        0,
        ten.map((rank) => rank + 1),
      );
      data.organic_results[0].link = "https://example.com/target";
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(data));
      vi.stubGlobal("fetch", fetchMock);
      await expect(serpApiProvider.fetchRank({ ...input(10), stopOnMatch })).rejects.toThrow(
        "organic_depth_not_covered",
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("preserves a known positive within the continuous prefix", async () => {
    const data = nativePage(0, gapAtEnd);
    data.organic_results[0].link = "https://example.com/target";
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(data));
    vi.stubGlobal("fetch", fetchMock);
    const result = await serpApiProvider.fetchRank(input(10));
    expect(result).toMatchObject({ position: 1, observation: { completeness: "unknown" } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
