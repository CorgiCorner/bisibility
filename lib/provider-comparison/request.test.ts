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
