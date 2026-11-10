import { dataForSeoRankRequest } from "@/lib/providers/serp/dataforseo-rank-request";
import { serpApiRankRequest } from "@/lib/providers/serp/serpapi-request";
import { describe, expect, it } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";
import { comparisonRankInput, comparisonRequestKey } from "./request";
import { comparisonResult } from "./result";

describe("isolated provider comparison native scope", () => {
  const snapshot = comparisonFixture(),
    tag = "comparison-tag";
  it("uses the same keyword/location/device, full20 depth and no stop-on-match", () => {
    const input = comparisonRankInput(snapshot, tag);
    expect(input).toMatchObject({
      keyword: snapshot.text,
      location: snapshot.location,
      device: "desktop",
      depth: 20,
      stopOnMatch: false,
    });
    const native = dataForSeoRankRequest(input);
    expect(JSON.parse(native.body)[0]).not.toHaveProperty("stop_crawl_on_match");
    expect(comparisonRequestKey("dataforseo", snapshot, native, tag)).toMatch(/^[a-f0-9]{64}$/);
    const body = JSON.parse(native.body);
    body[0].keyword = "Changed";
    expect(() =>
      comparisonRequestKey("dataforseo", snapshot, { ...native, body: JSON.stringify(body) }, tag),
    ).toThrow(/changed scope/);
  });
  it("allows exactly two SerpApi pages, excludes secrets, and rejects a changed market", () => {
    const native = serpApiRankRequest(comparisonRankInput(snapshot, tag));
    const first = comparisonRequestKey("serpapi", snapshot, native, tag);
    const url = new URL(native.url);
    url.searchParams.set("api_key", "not-stored");
    expect(comparisonRequestKey("serpapi", snapshot, { ...native, url: url.href }, tag)).toBe(
      first,
    );
    url.searchParams.set("start", "10");
    expect(comparisonRequestKey("serpapi", snapshot, { ...native, url: url.href }, tag)).not.toBe(
      first,
    );
    url.searchParams.set("start", "20");
    expect(() =>
      comparisonRequestKey("serpapi", snapshot, { ...native, url: url.href }, tag),
    ).toThrow(/quoted scope/);
    url.searchParams.delete("start");
    url.searchParams.set("device", "mobile");
    expect(() =>
      comparisonRequestKey("serpapi", snapshot, { ...native, url: url.href }, tag),
    ).toThrow(/changed scope/);
  });
  it("never invents absence or observation time from a parsed null rank", () => {
    expect(
      comparisonResult(
        { position: null, rankingUrl: null, costCents: 0, checkedAt: new Date() },
        snapshot,
        new Date(),
      ),
    ).toMatchObject({
      evidence: "unknown",
      observedAt: null,
      effectiveScope: null,
      completeThrough: null,
    });
    expect(() =>
      comparisonResult(
        { position: 101, rankingUrl: null, costCents: 0, checkedAt: new Date() },
        snapshot,
        new Date(),
      ),
    ).toThrow(/position/);
  });
});

it.each([10, 20, 50, 100] as const)(
  "bounds native pages and retained rows to selected depth %s",
  (depth) => {
    const snapshot = { ...comparisonFixture(), depth };
    const input = comparisonRankInput(snapshot, "tag");
    expect(input.depth).toBe(depth);
    const native = serpApiRankRequest(input);
    for (let start = 10; start < depth; start += 10) {
      const url = new URL(native.url);
      url.searchParams.set("start", String(start));
      expect(
        comparisonRequestKey("serpapi", snapshot, { ...native, url: url.href }, "tag"),
      ).toMatch(/^[a-f0-9]{64}$/);
    }
    const url = new URL(native.url);
    url.searchParams.set("start", String(depth));
    expect(() =>
      comparisonRequestKey("serpapi", snapshot, { ...native, url: url.href }, "tag"),
    ).toThrow(/quoted scope/);
    const rows = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      url: `https://example.com/${i}`,
      title: "Result",
      domain: "example.com",
    }));
    const result = comparisonResult(
      {
        position: depth,
        rankingUrl: "https://example.com",
        costCents: 1,
        checkedAt: new Date(),
        raw: { organic_results: rows },
      },
      snapshot,
      new Date(),
    );
    expect(result.results).toHaveLength(depth);
    expect(result.position).toBe(depth);
  },
);

it("admits one overview follow-up only under explicit frozen consent", () => {
  const base = comparisonFixture();
  const overview = {
    ...base,
    version: 2 as const,
    keywordId: null,
    aiOverview: true as const,
    depth: 10 as const,
    connections: base.connections.filter((x) => x.provider === "serpapi"),
  };
  const native = {
    method: "GET" as const,
    url: "https://serpapi.com/search.json?engine=google_ai_overview&page_token=first-token",
  };
  expect(() => comparisonRequestKey("serpapi", base, native, "tag")).toThrow("not quoted");
  const key = comparisonRequestKey("serpapi", overview, native, "tag");
  expect(key).not.toContain("first-token");
  expect(
    comparisonRequestKey(
      "serpapi",
      overview,
      { ...native, url: native.url.replace("first-token", "another-token") },
      "tag",
    ),
  ).toBe(key);
  expect(() =>
    comparisonRequestKey(
      "serpapi",
      overview,
      { ...native, url: native.url + "&q=another-query" },
      "tag",
    ),
  ).toThrow("changed scope");
});

it("freezes cache bypass only for explicitly quoted overview requests", () => {
  const base = comparisonFixture();
  const overview = {
    ...base,
    version: 2 as const,
    keywordId: null,
    aiOverview: true as const,
    depth: 10 as const,
    connections: base.connections.filter((x) => x.provider === "serpapi"),
  };
  const request = serpApiRankRequest(comparisonRankInput(overview));
  expect(new URL(request.url).searchParams.get("no_cache")).toBe("true");
  expect(() => comparisonRequestKey("serpapi", overview, request, "tag")).not.toThrow();
  const changed = new URL(request.url);
  changed.searchParams.delete("no_cache");
  expect(() =>
    comparisonRequestKey("serpapi", overview, { ...request, url: changed.href }, "tag"),
  ).toThrow("changed scope");
  expect(() => comparisonRequestKey("serpapi", base, request, "tag")).toThrow("changed scope");
});
