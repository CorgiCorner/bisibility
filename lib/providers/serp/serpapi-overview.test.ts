import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serpApiProvider } from "./serpapi";

const location = {
  gl: "us",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
};
const token = "short-lived-test-token";
const google = {
  search_metadata: { id: "google-search", status: "Success" },
  organic_results: Array.from({ length: 8 }, (_, i) => ({
    position: i + 1,
    link: `https://example.test/${i}`,
    title: `Result ${i + 1}`,
  })),
  ai_overview: {
    page_token: token,
    serpapi_link: `https://serpapi.com/search.json?engine=google_ai_overview&page_token=${token}`,
  },
};
const input = () => ({
  keyword: "Coffee",
  location,
  domain: "example.test",
  device: "desktop" as const,
  depth: 10 as const,
  stopOnMatch: false,
  allowIncompleteResults: true,
  captureProviderResponse: true,
  credentials: {
    apiKey: "test-api-key",
    usageObserver: {
      ...testUsageObserver,
      begin: vi.fn(testUsageObserver.begin),
      settle: vi.fn(testUsageObserver.settle),
    },
  },
});
function reply(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
afterEach(() => vi.unstubAllGlobals());
describe("explicit overview fetch", () => {
  it("does not spend an additional search during normal rank checks", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(google));
    vi.stubGlobal("fetch", fetch);
    const result = await serpApiProvider.fetchRank(input());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.billingUnits).toBe(1);
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it("immediately retrieves a quoted overview, accounts for both searches, and retains redacted original responses", async () => {
    const followup = {
      search_metadata: { id: "overview-search", status: "Success" },
      search_parameters: { page_token: token },
      ai_overview: { text_blocks: [{ type: "paragraph", snippet: "The saved overview text." }] },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(google))
      .mockResolvedValueOnce(reply(followup));
    vi.stubGlobal("fetch", fetch);
    const request = input();
    const result = await serpApiProvider.fetchRank({ ...request, fetchAiOverview: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("no_cache")).toBe("true");
    const url = new URL(String(fetch.mock.calls[1][0]));
    expect(url.searchParams.get("engine")).toBe("google_ai_overview");
    expect(url.searchParams.get("page_token")).toBe(token);
    expect(url.searchParams.get("q")).toBeNull();
    expect(result.billingUnits).toBe(2);
    expect(request.credentials.usageObserver.settle).toHaveBeenCalledTimes(2);
    expect(result.raw?.organic_results).toHaveLength(8);
    expect(result.observation?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resultKind: "ai_overview", title: "The saved overview text." }),
      ]),
    );
    expect(result.raw?.provider_response).toEqual([
      expect.objectContaining({
        ai_overview: expect.objectContaining({ page_token: "[redacted]" }),
      }),
      expect.objectContaining({ search_parameters: { page_token: "[redacted]" } }),
    ]);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result.providerResponse).toEqual(result.raw?.provider_response);
  });
  it("uses inline overview text without making the optional second request", async () => {
    const fetch = vi.fn().mockResolvedValue(
      reply({
        ...google,
        ai_overview: { page_token: token, text_blocks: [{ snippet: "Already included." }] },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await serpApiProvider.fetchRank({ ...input(), fetchAiOverview: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.billingUnits).toBe(1);
  });
  it("does not invent or buy an overview when Google supplies no token", async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ ...google, ai_overview: undefined }));
    vi.stubGlobal("fetch", fetch);
    const result = await serpApiProvider.fetchRank({ ...input(), fetchAiOverview: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      result.observation?.items.filter((item) => item.resultKind === "ai_overview"),
    ).toHaveLength(0);
  });
  it("rejects an unbounded overview request before any paid dispatch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      serpApiProvider.fetchRank({ ...input(), depth: 100, fetchAiOverview: true }),
    ).rejects.toThrow("quoted single search page");
    expect(fetch).not.toHaveBeenCalled();
  });
});
