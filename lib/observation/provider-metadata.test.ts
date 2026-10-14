import { describe, expect, it } from "vitest";
import {
  dataForSeoCapturedMetadata,
  providerObservationTime,
  serpApiCapturedMetadata,
} from "./provider-metadata";

describe("captured provider metadata", () => {
  it("retains provider time rather than a later collection or cache read", () => {
    expect(providerObservationTime("2026-10-01 12:05:00 +0000")).toBe("2026-10-01T12:05:00.000Z");
    expect(providerObservationTime("2026-10-01 12:05:00 UTC")).toBe("2026-10-01T12:05:00.000Z");
    expect(providerObservationTime("2026-10-01T12:05:00+02:00")).toBe("2026-10-01T10:05:00.000Z");
  });
  it.each(["2026-02-30 10:00:00 UTC", "2026-10-01 12:05:00", "today", 1790000000])(
    "rejects invalid or unzoned time %s",
    (value) => {
      expect(providerObservationTime(value)).toBeNull();
    },
  );
  it("keeps returned country scope instead of pretending the requested city was used", () => {
    const captured = serpApiCapturedMetadata([
      {
        search_metadata: { processed_at: "2026-10-01 12:00:00 UTC" },
        search_parameters: {
          location_requested: "Krakow,Poland",
          location_used: "Poland",
          hl: "pl",
          device: "mobile",
        },
      },
    ]);
    expect(captured.effectiveScope).toEqual({
      location: "Poland",
      language: "pl",
      device: "mobile",
    });
  });
  it("leaves inconsistent pages or missing proof unknown", () => {
    const page = {
      search_metadata: { processed_at: "2026-10-01 12:00:00 UTC" },
      search_parameters: { location_used: "Poland", hl: "pl", device: "mobile" },
    };
    expect(serpApiCapturedMetadata([page, {}])).toEqual({
      observedAt: null,
      observedThrough: null,
      effectiveScope: null,
    });
    expect(dataForSeoCapturedMetadata([{}]).observedAt).toBeNull();
  });
  it("does not make mixed-age pages look as fresh as their newest page", () => {
    expect(
      dataForSeoCapturedMetadata([
        { datetime: "2026-10-01 12:00:00 UTC" },
        { datetime: "2026-10-02 12:00:00 UTC" },
      ]),
    ).toEqual({
      observedAt: "2026-10-01T12:00:00.000Z",
      observedThrough: "2026-10-02T12:00:00.000Z",
    });
  });
});
