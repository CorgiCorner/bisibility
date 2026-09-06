import { describe, expect, it } from "vitest";
import {
  type DateFormat,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatDayOfMonth,
} from "./format";

const formats = ["day_first", "month_first", "iso"] as const satisfies readonly DateFormat[];

describe("formatDate", () => {
  it.each([
    ["day_first", "24 Aug 2026"],
    ["month_first", "Aug 24, 2026"],
    ["iso", "2026-08-24"],
  ] as const)("writes %s as %s", (format, expected) => {
    expect(formatDate("2026-08-24", format)).toBe(expected);
  });
});

describe("formatDateRange", () => {
  it.each(formats)("collapses the repeated month for %s, except ISO", (format) => {
    const label = formatDateRange("2026-08-24", "2026-08-30", format);
    if (format === "iso") {
      expect(label).toBe("2026-08-24 - 2026-08-30");
      return;
    }
    if (format === "day_first") {
      expect(label).toBe("24 - 30 Aug");
      return;
    }
    expect(label).toBe("Aug 24 - 30");
  });

  it.each(formats)("keeps both months when they differ for %s", (format) => {
    const label = formatDateRange("2026-08-24", "2026-09-02", format);
    if (format === "iso") {
      expect(label).toBe("2026-08-24 - 2026-09-02");
      return;
    }
    if (format === "day_first") {
      expect(label).toBe("24 Aug - 2 Sep");
      return;
    }
    expect(label).toBe("Aug 24 - Sep 2");
  });

  it.each(formats)("carries the year on both ends when a range crosses one for %s", (format) => {
    const label = formatDateRange("2025-12-24", "2026-01-02", format);
    if (format === "iso") {
      expect(label).toBe("2025-12-24 - 2026-01-02");
      return;
    }
    if (format === "day_first") {
      expect(label).toBe("24 Dec 2025 - 2 Jan 2026");
      return;
    }
    expect(label).toBe("Dec 24, 2025 - Jan 2, 2026");
  });

  it.each(formats)("formats a single-day range without inventing a span for %s", (format) => {
    expect(formatDateRange("2026-08-24", "2026-08-24", format)).toBe(
      format === "iso" ? "2026-08-24" : format === "day_first" ? "24 Aug" : "Aug 24",
    );
  });

  it("never uses an em dash", () => {
    for (const format of formats) {
      expect(formatDateRange("2026-08-24", "2026-08-30", format)).not.toContain("\u2014");
      expect(formatDateRange("2026-08-24", "2026-08-30", format)).toContain(" - ");
    }
  });
});

describe("formatDateTime", () => {
  const noonUtc = new Date("2026-08-24T12:40:00.000Z");

  it.each([
    ["day_first", "24 Aug 2026, 12:40"],
    ["month_first", "Aug 24, 2026, 12:40"],
    ["iso", "2026-08-24, 12:40"],
  ] as const)("writes %s with a 24-hour clock", (format, expected) => {
    expect(formatDateTime(noonUtc, format, "UTC")).toBe(expected);
  });

  it("honors the supplied time zone for the calendar day and clock", () => {
    expect(formatDateTime(noonUtc, "iso", "America/Los_Angeles")).toBe("2026-08-24, 05:40");
  });
});

describe("formatDayOfMonth", () => {
  it.each(formats)("returns the day number for %s", (format) => {
    expect(formatDayOfMonth("2026-08-24", format)).toBe("24");
  });
});
