import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import type { SerpSnapshotContinuation } from "@/lib/serp/snapshot-extension";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSerpApiSnapshotPage } from "./serpapi-snapshot";

const context: SerpSnapshotContinuation = {
  version: 1,
  capturedAt: new Date().toISOString(),
  keyword: "original keyword",
  domain: "example.com",
  device: "mobile",
  nextStart: 20,
  ended: false,
  location: {
    gl: "pl",
    hl: "pl",
    primaryGeoCode: null,
    primaryGeoName: "Poland",
    secondaryGeoName: "Poland",
  },
};
const input = {
  keyword: "changed keyword",
  domain: "example.org",
  device: "desktop" as const,
  location: context.location,
  credentials: {
    apiKey: "test-key",
    usageObserver: {
      begin: vi.fn().mockResolvedValue("receipt"),
      settle: vi.fn().mockResolvedValue(undefined),
    },
  },
};
const body = {
  search_metadata: { id: "page-3", status: "Success" },
  organic_results: [{ position: 1, link: "https://example.com/new" }],
  serpapi_pagination: { next: "http://127.0.0.1/private" },
};
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("SerpApi snapshot continuation", () => {
  it("requests only the next page with frozen scope, never a provider-supplied URL", async () => {
    const fetch = vi.fn().mockResolvedValue(response(body));
    vi.stubGlobal("fetch", fetch);
    const result = await fetchSerpApiSnapshotPage(input, context, 20, 20);
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin).toBe("https://serpapi.com");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      start: "20",
      q: "original keyword",
      device: "mobile",
      gl: "pl",
      hl: "pl",
      location: "Poland",
      nfpr: "1",
    });
    expect(result.raw?.organic_results).toMatchObject([
      { rank: 21, url: "https://example.com/new" },
    ]);
    expect(result.raw?.snapshotContinuation).toMatchObject({
      nextStart: 30,
      ended: false,
      capturedAt: context.capturedAt,
    });
    expect(input.credentials.usageObserver.settle).toHaveBeenCalledWith(
      "receipt",
      expect.objectContaining({ quantity: 1, providerRequestId: "page-3" }),
    );
  });
  it("records cached pages as zero usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ ...body, search_metadata: { status: "Cached" } })),
    );
    expect((await fetchSerpApiSnapshotPage(input, context, 20, 20)).billingUnits).toBe(0);
    expect(input.credentials.usageObserver.settle).toHaveBeenCalledWith(
      "receipt",
      expect.objectContaining({ quantity: 0, cached: true }),
    );
  });
  it("stops at an empty provider page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...body, organic_results: [] })));
    expect(
      (await fetchSerpApiSnapshotPage(input, context, 20, 20)).raw?.snapshotContinuation?.ended,
    ).toBe(true);
  });
  it.each([0, 21, 100])("rejects invalid offset %s before I/O", async (start) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSerpApiSnapshotPage(input, context, start, 20)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects expired continuation before I/O", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchSerpApiSnapshotPage(
        input,
        { ...context, capturedAt: new Date(Date.now() - 900_000).toISOString() },
        20,
        20,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("settles paid usage even when the returned page is malformed", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ ...body, organic_results: null }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSerpApiSnapshotPage(input, context, 20, 20)).rejects.toThrow(
      "invalid continuation page",
    );
    expect(input.credentials.usageObserver.settle).toHaveBeenCalledWith(
      "receipt",
      expect.objectContaining({ quantity: 1 }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry a network failure with uncertain charges", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("network"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSerpApiSnapshotPage(input, context, 20, 20)).rejects.toBeInstanceOf(
      ProviderUsagePersistenceError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(input.credentials.usageObserver.settle).toHaveBeenCalledWith(
      "receipt",
      expect.objectContaining({ quantity: null }),
    );
  });
  it("does not retry a provider rejection", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ error: "rate limited" }, 429));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSerpApiSnapshotPage(input, context, 20, 20)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("continues the ordinal after a short first page instead of the nominal offset", async () => {
    const page = {
      ...body,
      organic_results: [
        { position: 1, link: "https://example.com/a" },
        { position: 2, link: "https://example.net/b" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(page)));
    const result = await fetchSerpApiSnapshotPage(input, context, 10, 9);
    expect(result.raw?.organic_results).toMatchObject([{ rank: 10 }, { rank: 11 }]);
    expect(result.position).toBe(10);
    // The nominal numbering (start + position) would have given 11 and 12.
    expect(result.raw?.organic_results?.map((row) => row.rank)).not.toContain(12);
  });
  it("rejects a preceding count outside 0..start before I/O", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const preceding of [-1, 21, 1.5, Number.NaN])
      await expect(fetchSerpApiSnapshotPage(input, context, 20, preceding)).rejects.toThrow(
        "Snapshot continuation window closed.",
      );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a position that falls outside the page after the preceding organic results", async () => {
    const page = { ...body, organic_results: [{ position: 11, link: "https://example.com/z" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(page)));
    await expect(fetchSerpApiSnapshotPage(input, context, 10, 9)).rejects.toThrow(
      "invalid continuation positions",
    );
  });
  it("reports the cumulative count of organic results the provider returned", async () => {
    const page = {
      ...body,
      organic_results: [
        { position: 1, link: "https://example.com/a" },
        { position: 2, link: "https://example.net/b" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(page)));
    const result = await fetchSerpApiSnapshotPage(input, context, 10, 9);
    expect(result.raw?.snapshotContinuation).toMatchObject({ nextStart: 20, organicReturned: 11 });
  });
  it("counts a dropped trailing redirect row as returned", async () => {
    const page = {
      ...body,
      organic_results: [
        { position: 1, link: "https://example.com/a" },
        { position: 2, link: "https://www.google.com/url?q=https%3A%2F%2Fexample.net%2Fb" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(page)));
    const result = await fetchSerpApiSnapshotPage(input, context, 10, 10);
    expect(result.raw?.organic_results).toHaveLength(1);
    expect(result.raw?.snapshotContinuation).toMatchObject({ organicReturned: 12 });
  });
});
