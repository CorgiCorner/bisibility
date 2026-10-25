import { describe, expect, it } from "vitest";
import { zonedDateTimeInputToUtc, zonedDateTimeInputWithOffset } from "./date-boundary";
import { evidenceRunsPath, parseEvidenceRunsQuery } from "./evidence-runs-query";
import { parseExactCheckRange } from "./exact-range";

describe("UI-3 exact UTC URL and viewer-zone entry", () => {
  it("round trips millisecond bounds and both repeated DST hours", () => {
    for (const value of ["2026-10-25T00:00:00.123Z", "2026-10-25T01:00:00.000Z"])
      expect(
        zonedDateTimeInputToUtc(
          zonedDateTimeInputWithOffset(new Date(value), "Europe/Warsaw"),
          "Europe/Warsaw",
        ),
      ).toBe(value);
  });
  it("rejects a DST gap, impossible calendar date and wrong offset for the viewer zone", () => {
    for (const value of ["2026-03-29T02:30:00", "2026-02-30T12:00:00", "2026-10-23T08:00:00+09:00"])
      expect(() => zonedDateTimeInputToUtc(value, "Europe/Warsaw")).toThrow();
  });
  it("uses a safe fallback for invalid, reversed and over-cap ranges", () => {
    for (const [from, to] of [
      ["bad", "bad"],
      ["2026-10-24T00:00:00Z", "2026-10-23T00:00:00Z"],
      ["2026-01-01T00:00:00Z", "2026-10-23T00:00:00Z"],
    ])
      expect(parseExactCheckRange(from, to)).toEqual({ range: null, error: "invalidRange" });
  });
  it("keeps exact bounds and the programmatic trigger in the URL", () => {
    const query = {
      from: "2026-10-23T06:00:00Z",
      to: "2026-10-23T07:00:00Z",
      trigger: "programmatic" as const,
    };
    const url = new URL(evidenceRunsPath("prj_test", query), "https://example.test");
    expect(parseEvidenceRunsQuery(url.searchParams)).toMatchObject(query);
  });
});
