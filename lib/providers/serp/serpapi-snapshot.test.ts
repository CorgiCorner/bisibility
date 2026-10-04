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
    const result = await fetchSerpApiSnapshotPage(input, context, 20);
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
    expect((await fetchSerpApiSnapshotPage(input, context, 20)).billingUnits).toBe(0);
    expect(input.credentials.usageObserver.settle).toHaveBeenCalledWith(
      "receipt",
      expect.objectContaining({ quantity: 0, cached: true }),
    );
  });
  it("stops at an empty provider page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...body, organic_results: [] })));
    expect(
      (await fetchSerpApiSnapshotPage(input, context, 20)).raw?.snapshotContinuation?.ended,
    ).toBe(true);
  });
  it.each([0, 21, 100])("rejects invalid offset %s before I/O", async (start) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSerpApiSnapshotPage(input, context, start)).rejects.toThrow();
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
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("settles paid usage even when the returned page is malformed", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ ...body, organic_results: null }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSerpApiSnapshotPage(input, context, 20)).rejects.toThrow(
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
    await expect(fetchSerpApiSnapshotPage(input, context, 20)).rejects.toBeInstanceOf(
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
    await expect(fetchSerpApiSnapshotPage(input, context, 20)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
