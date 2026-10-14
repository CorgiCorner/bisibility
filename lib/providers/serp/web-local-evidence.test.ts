import { queuedDataForSeoObservation } from "@/lib/observation/queued-dataforseo";
import { describe, expect, it } from "vitest";
import { dataForSeoObservationRun } from "./observation-extract-dataforseo";
import { serpApiObservationRun } from "./observation-extract-serpapi";
import { dataForSeoSentScope, serpApiEffectiveScope, serpApiWebPageProof } from "./web-local-proof";

const at = new Date("2026-10-12T10:00:00Z");
const scope = { location: "City A", language: "en", device: "desktop" };
const policy = {
  depth: 100,
  stopOnMatch: false,
  findTargetsIn: null,
  forcedAiOverview: false as const,
};
function dfs(items: unknown[]) {
  const result = { datetime: at.toISOString(), location_code: 123, language_code: "en", items };
  return dataForSeoObservationRun({
    items,
    providerResults: [result],
    sentScope: { scope, locationCode: 123 },
    configuredScope: scope,
    executedAt: new Date("2026-10-13T10:00:00Z"),
    completeness: "complete",
    requestPolicy: policy,
  });
}
function serp(places: unknown[], extra: Record<string, unknown> = {}) {
  return serpApiObservationRun({
    pages: [
      {
        search_parameters: {
          engine: "google",
          location_used: "City A",
          hl: "en",
          device: "desktop",
        },
        search_metadata: { processed_at: at.toISOString() },
        local_results: { places },
        ...extra,
      },
    ],
    configuredScope: scope,
    executedAt: new Date("2026-10-13T10:00:00Z"),
    completeness: "complete",
    requestPolicy: policy,
  });
}
describe("documented production web-local evidence", () => {
  it("retains real DFS promotion, slot, page, original ordinal and opaque IDs without inventing completeness", () => {
    const run = dfs([
      { type: "organic" },
      {
        type: "local_pack",
        page: 1,
        rank_group: 2,
        rank_absolute: 4,
        is_paid: false,
        cid: "18446744073709551615",
        place_id: "ChIJ-opaque",
        title: "Branch A",
      },
    ]);
    expect(run.items[0]).toMatchObject({
      promotion: "organic",
      rankScale: "pack_slot",
      positionInBlock: 2,
      sourcePage: 1,
      sourceOrdinal: 1,
      cid: "18446744073709551615",
      placeId: "ChIJ-opaque",
      observedAt: at,
    });
    expect(run.effectiveScope).toEqual(scope);
    expect(run.requestPolicy.evidence).toMatchObject({
      observedAt: at.toISOString(),
      completeThrough: { local_pack: null },
      webLocalPack: { version: 1, identityIssues: 0 },
    });
  });
  it("retains promoted/unknown DFS rows and never uses array index as a missing rank", () => {
    const run = dfs([{ type: "local_pack", is_paid: true, rank_group: 1 }, { type: "local_pack" }]);
    expect(run.items.map((item) => item.promotion)).toEqual(["promoted", "unknown"]);
    expect(run.items[1].positionInBlock).toBeNull();
  });
  it("keeps live and queued DFS evidence identical for the same actual task and result", () => {
    const items = [{ type: "local_pack", page: 1, rank_group: 1, is_paid: false, cid: "123" }];
    const result = { items, datetime: at.toISOString(), language_code: "en" };
    const live = dataForSeoObservationRun({
      items,
      providerResults: [result],
      sentScope: { scope },
      configuredScope: scope,
      executedAt: at,
      completeness: "complete",
      requestPolicy: policy,
    });
    const queued = queuedDataForSeoObservation(
      {
        data: {
          location_name: "City A",
          language_code: "en",
          device: "desktop",
          stop_crawl_on_match: [],
        },
        result: [result],
      },
      items,
      100,
      at,
    );
    expect(queued).toEqual(live);
  });
  it("uses documented SerpApi ad semantics and CID meaning without discarding repeated strong IDs", () => {
    const run = serp([
      { position: 1, ad: true, place_id: "123" },
      { position: 2, place_id: "123" },
      { position: 3, ad: false, place_id: "456" },
    ]);
    expect(run.items).toHaveLength(3);
    expect(run.items.map((item) => item.promotion)).toEqual(["promoted", "organic", "organic"]);
    expect(run.items.map((item) => item.cid)).toEqual(["123", "123", "456"]);
    expect(run.items.map((item) => item.placeId)).toEqual([null, null, null]);
    expect(run.items.map((item) => item.sourceOrdinal)).toEqual([0, 1, 2]);
    expect(run.items.map((item) => item.positionInBlock)).toEqual([1, 2, 3]);
    expect(run.requestPolicy.evidence?.completeThrough.local_pack).toBeNull();
  });
  it("keeps legacy bare/Finder containers unclassified and does not inherit organic completeness", () => {
    const run = serp([], {
      local_results: [{ position: 2, place_id: "legacy" }],
      places_results: [{ position: 1, place_id: "finder" }],
    });
    expect(run.items.map((item) => item.promotion)).toEqual(["unknown", "unknown"]);
    expect(run.items.map((item) => item.rankScale)).toEqual([null, null]);
    expect(run.requestPolicy.evidence?.completeThrough.local_pack).toBeNull();
  });
  it("records unsafe numeric/conflicting ID issues without serializing rounded identifiers", () => {
    const run = serp([
      { position: 1, place_id: 9_007_199_254_740_992 },
      { position: 2, place_id: "123", data_cid: "456" },
    ]);
    expect(run.items[0].cid).toBeNull();
    expect(run.requestPolicy.evidence?.webLocalPack?.identityIssues).toBe(2);
    expect(JSON.stringify(run.items.map(({ cid, placeId }) => ({ cid, placeId })))).not.toContain(
      "9007199254740992",
    );
  });
  it("preserves provider page time and blocks false precision on mismatching echo", () => {
    expect(
      dataForSeoSentScope(
        { location_code: 123, language_code: "en", device: "mobile" },
        { primaryGeoCode: 123, primaryGeoName: "City A" },
      )?.scope.device,
    ).toBe("mobile");
    const run = dfs([{ type: "local_pack", page: 2, rank_group: 1, is_paid: false }]);
    expect(run.items[0].sourcePage).toBe(2);
    expect(run.items[0].observedAt).toEqual(at);
    expect(
      serpApiEffectiveScope(
        [{ search_parameters: { location_used: "Country", hl: "en", device: "mobile" } }],
        [{ engine: "google", start: 0, wireLocation: "City A alias", scope }],
      ).scope,
    ).toEqual({ location: "Country", language: "en", device: "mobile" });
  });
  it("keeps separate pages/blocks and original times instead of merging a synthetic complete prefix", () => {
    const pages = [0, 1].map((index) => ({
      search_parameters: {
        engine: "google",
        start: index * 10,
        location_used: "City A",
        hl: "en",
        device: "desktop",
      },
      search_metadata: { processed_at: new Date(at.getTime() + index * 60_000).toISOString() },
      local_results: { places: [{ position: 1, place_id: String(index + 100) }] },
    }));
    const run = serpApiObservationRun({
      pages,
      configuredScope: scope,
      executedAt: at,
      completeness: "complete",
      requestPolicy: policy,
    });
    expect(run.items.map((item) => item.sourcePage)).toEqual([1, 2]);
    expect(new Set(run.items.map((item) => item.sourceBlockId)).size).toBe(2);
    expect(run.items.map((item) => item.observedAt?.toISOString())).toEqual([
      at.toISOString(),
      new Date(at.getTime() + 60_000).toISOString(),
    ]);
    expect(run.requestPolicy.evidence?.completeThrough.local_pack).toBeNull();
  });
  it("uses actual sent scope when no used-location echo exists, and keeps echo mismatches visible", () => {
    const sent = [
      {
        engine: "google" as const,
        start: 0,
        wireLocation: "Actual fallback country",
        scope: { ...scope, location: "Country", device: "mobile" },
      },
    ];
    const actual = serpApiEffectiveScope([{ search_parameters: { engine: "google" } }], sent);
    expect(actual).toEqual({
      scope: { location: "Country", language: "en", device: "mobile" },
      source: "sent_request",
    });
    const run = dataForSeoObservationRun({
      items: [],
      providerResults: [{ location_code: 999, datetime: at.toISOString() }],
      sentScope: { scope, locationCode: 123 },
      configuredScope: scope,
      executedAt: at,
      completeness: "complete",
      requestPolicy: policy,
    });
    expect(run.effectiveScope).toBeNull();
  });

  it("never upgrades caller completeness claims or missing rows into local absence", () => {
    const run = dataForSeoObservationRun({
      items: [],
      providerResults: [{ datetime: at.toISOString(), items: [] }],
      sentScope: { scope },
      configuredScope: scope,
      executedAt: at,
      completeness: "complete",
      requestPolicy: {
        ...policy,
        evidence: {
          version: 1,
          adapterVersion: "untrusted-local-claim",
          observedAt: null,
          requestedAt: null,
          completeThrough: { organic_result: 100, local_pack: 3 },
        },
      },
    });
    expect(run.requestPolicy.evidence?.completeThrough).toEqual({
      organic_result: 100,
      local_pack: null,
    });
    expect(run.items).toEqual([]);
  });

  it("validates explicit echoed offsets before applying the sent-page fallback", () => {
    const sent = { engine: "google" as const, start: 10, scope };
    expect(
      serpApiWebPageProof({ search_parameters: { engine: "google", start: "10" } }, sent),
    ).toMatchObject({ valid: true, page: 2 });
    expect(serpApiWebPageProof({ search_parameters: { engine: "google" } }, sent)).toMatchObject({
      valid: true,
      page: 2,
    });
    for (const start of [0, "0", null, -1, 1.5, "1e1", "invalid"]) {
      expect(
        serpApiWebPageProof({ search_parameters: { engine: "google", start } }, sent),
      ).toMatchObject({ valid: false, page: null, reason: "page_conflict" });
    }
  });
});
