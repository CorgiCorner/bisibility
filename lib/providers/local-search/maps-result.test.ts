import { describe, expect, it } from "vitest";
import { MAPS_LEGACY_ADAPTER_VERSION } from "./maps-capability";
import { parseMapsResult } from "./maps-result";
import { mapsFixture, mapsResultEnvelope, nativeIds, receiptTime } from "./maps-test-fixtures";

describe("correlated Maps task evidence", () => {
  it("retains sparse ranks, IDs, ads, point/cutoff/zoom without inventing completeness or executed geography", () => {
    const binding = mapsFixture().binding;
    const result = parseMapsResult(
      mapsResultEnvelope(),
      nativeIds[0],
      binding,
      receiptTime,
      MAPS_LEGACY_ADAPTER_VERSION,
    );
    expect(result).toMatchObject({
      completeness: "unknown",
      effectiveScope: null,
      configuredScope: {
        scopeClass: "coordinate_seed",
        coordinates: binding.point.coordinate,
        zoom: 14,
      },
      requestPolicy: {
        cutoff: 20,
        zoom: 14,
        evidence: {
          observedAt: "2026-10-12T11:58:00.000Z",
          completeThrough: { map_listing: null },
        },
      },
    });
    expect(
      result.items.map((item) => ({
        rank: item.rankGroup,
        promotion: item.promotion,
        rankScale: item.rankScale,
      })),
    ).toEqual([
      { rank: 1, promotion: "organic", rankScale: "maps_organic" },
      { rank: 1, promotion: "promoted", rankScale: null },
      { rank: 3, promotion: "organic", rankScale: "maps_organic" },
    ]);
    expect(JSON.stringify(result.items[0])).toContain("9007199254740993123");
  });
  it("does not turn an empty response into absence evidence", () => {
    const data = mapsResultEnvelope();
    data.tasks[0].result[0].items = [];
    data.tasks[0].result[0].items_count = 0;
    expect(parseMapsResult(data, nativeIds[0], mapsFixture().binding, receiptTime)).toMatchObject({
      items: [],
      completeness: "unknown",
    });
  });
  it.each(["id", "path", "coordinate", "device", "keyword", "language", "count", "flags"])(
    "rejects mismatched original %s",
    (field) => {
      const data = mapsResultEnvelope();
      const task = data.tasks[0],
        result = task.result[0];
      const changed: Record<string, unknown> = task.data;
      if (field === "id") task.id = nativeIds[1];
      if (field === "path") task.path[6] = nativeIds[1];
      if (field === "coordinate") changed.location_coordinate = "0,0,14z";
      if (field === "device") changed.device = "mobile";
      if (field === "keyword") result.keyword = "another keyword";
      if (field === "language") result.language_code = "pl";
      if (field === "count") result.items_count = 20;
      if (field === "flags") changed.search_places = true;
      expect(() =>
        parseMapsResult(data, nativeIds[0], mapsFixture().binding, receiptTime),
      ).toThrow();
    },
  );
});
