import { describe, expect, it } from "vitest";
import {
  MAPS_ADAPTER_VERSION,
  MAPS_LEGACY_ADAPTER_VERSION,
  mapsRetrievalCapability,
} from "./maps-capability";
import { parseMapsResult } from "./maps-result";
import { mapsFixture, mapsResultEnvelope, nativeIds, receiptTime } from "./maps-test-fixtures";

describe("versioned Maps query seed acknowledgment", () => {
  it("acknowledges only the exact completed original query seed, never exact observer geometry", () => {
    const run = parseMapsResult(
      mapsResultEnvelope(),
      nativeIds[0],
      mapsFixture().binding,
      receiptTime,
    );
    expect(run.effectiveScope).toEqual(run.configuredScope);
    expect(run.effectiveScope?.scopeClass).toBe("coordinate_seed");
    expect(run.requestPolicy.pointAcknowledgment).toEqual({
      version: 1,
      class: "coordinate_seed",
      known: true,
      exactObserverPoint: false,
    });
    expect(run.requestPolicy.evidence?.adapterVersion).toBe(MAPS_ADAPTER_VERSION);
    expect(run.requestPolicy.evidence?.completeThrough.map_listing).toBeNull();
  });
  it("missing explicit flags stays unknown while legacy task collection remains available", () => {
    const data = mapsResultEnvelope();
    const echo: Record<string, unknown> = data.tasks[0].data;
    delete echo.search_this_area;
    const result = parseMapsResult(data, nativeIds[0], mapsFixture().binding, receiptTime);
    expect(result.effectiveScope).toBeNull();
    expect(result.requestPolicy.pointAcknowledgment?.known).toBe(false);
    expect(
      parseMapsResult(
        mapsResultEnvelope(),
        nativeIds[0],
        mapsFixture().binding,
        receiptTime,
        MAPS_LEGACY_ADAPTER_VERSION,
      ).effectiveScope,
    ).toBeNull();
    expect(mapsRetrievalCapability(MAPS_LEGACY_ADAPTER_VERSION).adapterVersion).toBe(
      MAPS_LEGACY_ADAPTER_VERSION,
    );
  });
});
