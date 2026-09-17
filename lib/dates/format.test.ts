import { describe, expect, it } from "vitest";
import {
  type DateFormat,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatDayOfMonth,
  formatDisplayDate,
  formatDisplayDateRange,
  formatDisplayDateTime,
  formatDisplayDateTimeCurrentYear,
  formatDisplayDateTimeWithSeconds,
  formatDisplayMonthYear,
  formatDisplayRelativeDay,
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

describe("locale-aware display dates", () => {
  const spanishDayFirst = { dateFormat: "day_first", locale: "es-ES", timeZone: "UTC" } as const;

  it("lets a non-English locale own its own field order and connectives", () => {
    expect(formatDisplayDate("2026-08-24", spanishDayFirst)).toBe("24 de agosto de 2026");
    // The English-only month_first preference never reorders another locale's pattern.
    expect(
      formatDisplayDate("2026-08-24", {
        ...spanishDayFirst,
        dateFormat: "month_first",
      }),
    ).toBe("24 de agosto de 2026");
    expect(formatDisplayDate("2026-08-24", { ...spanishDayFirst, dateFormat: "iso" })).toBe(
      "2026-08-24",
    );
  });

  it.each([
    ["day_first", "2026年8月24日"],
    ["month_first", "2026年8月24日"],
    ["iso", "2026-08-24"],
  ] as const)("keeps the Japanese year-first pattern for %s", (dateFormat, expected) => {
    const context = { dateFormat, locale: "ja", timeZone: "UTC" };
    expect(formatDisplayDate("2026-08-24", context)).toBe(expected);
    expect(formatDisplayMonthYear("2026-08-01", context)).toBe(
      dateFormat === "iso" ? "2026-08" : "2026年8月",
    );
  });

  it("keeps date-only keys in their UTC calendar day and carries both years across a range", () => {
    expect(
      formatDisplayDateRange("2025-12-24", "2026-01-02", {
        dateFormat: "day_first",
        locale: "pl",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("24 grudnia 2025 - 2 stycznia 2026");
    expect(
      formatDisplayDateRange("2026-08-24", "2026-08-30", {
        dateFormat: "day_first",
        locale: "pl",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("24 sierpnia - 30 sierpnia");
  });

  it("uses the supplied timezone for instants while retaining a 24-hour clock", () => {
    expect(
      formatDisplayDateTime(new Date("2026-01-01T02:30:00.000Z"), {
        dateFormat: "day_first",
        locale: "es-ES",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("31 de diciembre de 2025, 18:30");
    expect(
      formatDisplayDateTime(new Date("2026-01-01T08:30:00.000Z"), {
        dateFormat: "day_first",
        locale: "es-ES",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("1 de enero de 2026, 00:30");
    expect(
      formatDisplayDateTime(new Date("2026-03-08T10:30:00.000Z"), {
        dateFormat: "day_first",
        locale: "es-ES",
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("8 de marzo de 2026, 03:30");
  });

  it("includes seconds in the supplied reader timezone when diagnostic precision is required", () => {
    expect(
      formatDisplayDateTimeWithSeconds(new Date("2026-09-05T06:00:45.000Z"), {
        dateFormat: "day_first",
        locale: "pl",
        timeZone: "Europe/Warsaw",
      }),
    ).toBe("5 września 2026, 08:00:45");
  });

  it("uses locale-native relative calendar-day grammar and honors current-year boundaries", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(
      formatDisplayRelativeDay(now, now, {
        dateFormat: "day_first",
        locale: "pl",
        timeZone: "UTC",
      }),
    ).toBe("dzisiaj");
    expect(
      formatDisplayRelativeDay(new Date("2026-08-23T12:00:00.000Z"), now, {
        dateFormat: "day_first",
        locale: "es-ES",
        timeZone: "UTC",
      }),
    ).toBe("ayer");
    expect(
      formatDisplayRelativeDay(now, now, {
        dateFormat: "day_first",
        locale: "ja",
        timeZone: "UTC",
      }),
    ).toBe("今日");
    expect(
      formatDisplayDateTimeCurrentYear(
        new Date("2025-12-31T23:30:00.000Z"),
        new Date("2026-01-01T00:30:00.000Z"),
        { dateFormat: "day_first", locale: "pl", timeZone: "UTC" },
      ),
    ).toBe("31 grudnia 2025, 23:30");
  });
});
