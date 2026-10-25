import { localeValues } from "@/i18n/config";
import { describe, expect, it } from "vitest";
import { formatCheckWindowLabel } from "./window-label";

describe("CN-4 viewer-timezone half-open labels", () => {
  it.each(localeValues)("formats normal, repeated and skipped Warsaw hours in %s", (locale) => {
    const label = (start: string, end: string) =>
      formatCheckWindowLabel({ start, end, timeZone: "Europe/Warsaw", locale });
    expect(label("2026-10-24T00:00:00Z", "2026-10-24T01:00:00Z")).toBe("02:00–03:00");
    expect(label("2026-10-25T00:00:00Z", "2026-10-25T01:00:00Z")).toBe(
      "02:00–02:00 (UTC+02:00 → UTC+01:00)",
    );
    expect(label("2026-10-25T01:00:00Z", "2026-10-25T02:00:00Z")).toBe("02:00–03:00 (UTC+01:00)");
    expect(label("2026-03-29T00:00:00Z", "2026-03-29T01:00:00Z")).toBe(
      "01:00–03:00 (UTC+01:00 → UTC+02:00)",
    );
    expect(
      formatCheckWindowLabel({
        start: "2026-10-25T00:00:00Z",
        end: "2026-10-25T01:00:00Z",
        timeZone: "UTC",
        locale,
      }),
    ).toBe("00:00–01:00");
  });
  it("does not invent a valid range from invalid or reversed instants", () => {
    for (const [start, end] of [
      ["invalid", "2026-10-25T01:00:00Z"],
      ["2026-10-25T01:00:00Z", "invalid"],
      ["2026-10-25T01:00:00Z", "2026-10-25T00:00:00Z"],
    ] as const) {
      expect(() => formatCheckWindowLabel({ start, end, timeZone: "UTC", locale: "en" })).toThrow(
        RangeError,
      );
    }
  });
});
