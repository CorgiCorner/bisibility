import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import { afterEach, expect, it, vi } from "vitest";
import { dataForSeoProvider } from "./dataforseo";
import { serpApiProvider } from "./serpapi";

vi.mock("server-only", () => ({}));
const location = {
  gl: "us",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "Actual country",
  secondaryGeoName: "Actual country alias",
};
const credentials = {
  login: "synthetic-only",
  password: "synthetic-only",
  apiKey: "synthetic-only",
  usageObserver: testUsageObserver,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("actual DFS producer captures sent scope and parser proof before persistence without extra requests", async () => {
  const at = new Date("2026-10-12T10:00:00Z");
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        status_code: 20000,
        cost: 0,
        tasks: [
          {
            status_code: 20000,
            cost: 0,
            result: [
              {
                datetime: at.toISOString(),
                items: [
                  { type: "organic", rank_group: 1, url: "https://mine.example.com/" },
                  {
                    type: "local_pack",
                    rank_group: 1,
                    rank_absolute: 2,
                    page: 1,
                    is_paid: false,
                    cid: "123",
                  },
                ],
              },
            ],
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await dataForSeoProvider.fetchRank({
    keyword: "synthetic",
    domain: "mine.example.com",
    device: "mobile",
    location,
    credentials,
    depth: 20,
    stopOnMatch: false,
  });
  expect(result.observation?.effectiveScope).toEqual({
    location: "Actual country",
    language: "en",
    device: "mobile",
  });
  expect(result.observation?.items[0]).toMatchObject({
    promotion: "organic",
    positionInBlock: 1,
    observedAt: at,
  });
  expect(result.observation?.requestPolicy.evidence?.webLocalPack?.scopeSource).toBe(
    "sent_request",
  );
  expect(result.observation?.requestPolicy.evidence?.completeThrough.local_pack).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("actual SerpApi producer provides sent-page authority when provider echoes are absent", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        search_metadata: { status: "Success", processed_at: "2026-10-12 10:00:00 UTC" },
        organic_results: [{ position: 1, link: "https://mine.example.com/" }],
        local_results: { places: [{ position: 2, place_id: "123" }] },
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await serpApiProvider.fetchRank({
    keyword: "synthetic",
    domain: "mine.example.com",
    device: "mobile",
    location,
    credentials,
    depth: 10,
    stopOnMatch: false,
  });
  expect(result.observation?.effectiveScope).toEqual({
    location: "Actual country",
    language: "en",
    device: "mobile",
  });
  expect(result.observation?.items[0]).toMatchObject({
    promotion: "organic",
    cid: "123",
    placeId: null,
    sourcePage: 1,
    sourceOrdinal: 0,
    positionInBlock: 2,
  });
  expect(result.observation?.requestPolicy.evidence?.completeThrough.local_pack).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
