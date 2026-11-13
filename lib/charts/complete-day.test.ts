import { describe, expect, it } from "vitest";
import { completeSeriesEnd } from "./complete-day";

describe("completeSeriesEnd", () => {
  const now = new Date("2026-11-10T15:00:00.000Z");

  it("stops a series that includes today on yesterday", () => {
    expect(completeSeriesEnd({ now, requestedEnd: "2026-11-10", timeZone: "UTC" })).toBe(
      "2026-11-09",
    );
  });

  it("uses a source freshness date that is already complete", () => {
    expect(
      completeSeriesEnd({
        freshness: "2026-11-07",
        now,
        requestedEnd: "2026-11-10",
        timeZone: "UTC",
      }),
    ).toBe("2026-11-07");
  });

  it("keeps a requested end that is already in the past", () => {
    expect(completeSeriesEnd({ now, requestedEnd: "2026-11-01", timeZone: "UTC" })).toBe(
      "2026-11-01",
    );
  });

  it("uses yesterday in the project time zone around midnight", () => {
    const midnight = new Date("2026-11-10T07:30:00.000Z");
    expect(completeSeriesEnd({ now: midnight, requestedEnd: "2026-11-10", timeZone: "UTC" })).toBe(
      "2026-11-09",
    );
    expect(
      completeSeriesEnd({
        now: midnight,
        requestedEnd: "2026-11-10",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("2026-11-08");
  });
});
