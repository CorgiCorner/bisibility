import { describe, expect, it } from "vitest";
import {
  localizedDateTimeInputToUtc,
  localizedDateTimeInputValue,
  localizedInputCalendarDay,
  localizedInputSelectDay,
} from "./localized-date-input";

describe.each(["en", "pl", "ja", "es-ES"])("localized exact range: %s", (locale) => {
  it.each(["2026-10-23T06:00:00.000Z", "2026-10-25T00:30:00.123Z", "2026-10-25T01:30:00.123Z"])(
    "round trips %s without displaying ISO",
    (instant) => {
      const value = localizedDateTimeInputValue(new Date(instant), locale, "Europe/Warsaw");
      expect(value).not.toContain("T");
      expect(localizedDateTimeInputToUtc(value, locale, "Europe/Warsaw")).toBe(instant);
      expect(localizedInputCalendarDay(value, locale, "Europe/Warsaw")).toBe(instant.slice(0, 10));
    },
  );
  it("recalculates the offset when the calendar crosses DST", () => {
    const value = localizedDateTimeInputValue(
      new Date("2026-10-24T06:00:00Z"),
      locale,
      "Europe/Warsaw",
    );
    const next = localizedInputSelectDay(value, "2026-10-26", locale, "Europe/Warsaw");
    expect(next).toContain("+01:00");
    expect(localizedDateTimeInputToUtc(next, locale, "Europe/Warsaw")).toBe(
      "2026-10-26T07:00:00.000Z",
    );
  });
  it("rejects a malformed draft and lets the calendar repair it", () => {
    expect(() => localizedDateTimeInputToUtc("not a date", locale, "Europe/Warsaw")).toThrow();
    expect(localizedInputCalendarDay("not a date", locale, "Europe/Warsaw")).toBeUndefined();
    const next = localizedInputSelectDay("not a date", "2026-10-26", locale, "Europe/Warsaw");
    expect(localizedInputCalendarDay(next, locale, "Europe/Warsaw")).toBe("2026-10-26");
  });
  it("rejects impossible calendar dates and DST gaps", () => {
    expect(() => localizedInputSelectDay("", "2026-02-30", locale, "Europe/Warsaw")).toThrow();
    const before = localizedDateTimeInputValue(
      new Date("2026-03-28T01:30:00Z"),
      locale,
      "Europe/Warsaw",
    );
    expect(() => localizedInputSelectDay(before, "2026-03-29", locale, "Europe/Warsaw")).toThrow();
  });
});
