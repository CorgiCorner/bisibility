import { describe, expect, it } from "vitest";
import { createUserDateTimeFormatter } from "./user-datetime";

const lateUtc = new Date("2026-06-19T23:30:00.000Z");

describe("user date/time formatter", () => {
  it("formats project dates in the supplied timezone", () => {
    expect(
      createUserDateTimeFormatter({ dateFormat: "iso", timezone: "UTC" }).formatDate(lateUtc),
    ).toBe("2026-06-19");

    expect(
      createUserDateTimeFormatter({
        dateFormat: "iso",
        timezone: "Europe/Warsaw",
      }).formatDate(lateUtc),
    ).toBe("2026-06-20");
  });

  it("honors the persisted date format variants with a fixed en-US locale", () => {
    expect(
      createUserDateTimeFormatter({
        dateFormat: "eu",
        timezone: "Europe/Warsaw",
      }).formatDate(lateUtc),
    ).toBe("20/06/2026");

    expect(
      createUserDateTimeFormatter({
        dateFormat: "long",
        timezone: "Europe/Warsaw",
      }).formatDate(lateUtc),
    ).toBe("Jun 20, 2026");
  });

  it("formats clock labels in the supplied project timezone", () => {
    expect(
      createUserDateTimeFormatter({
        dateFormat: "iso",
        timezone: "America/New_York",
      }).formatTime(lateUtc),
    ).toBe("19:30");
  });

  it("formats a human-readable date and time through one context", () => {
    expect(
      createUserDateTimeFormatter({
        dateFormat: "long",
        timezone: "UTC",
      }).formatDateTime(new Date("2026-07-18T13:40:00.000Z")),
    ).toBe("Jul 18, 2026, 13:40");
  });

  it("uses English timezone-aware day labels for activity grouping", () => {
    const formatter = createUserDateTimeFormatter({
      dateFormat: "iso",
      timezone: "Europe/Warsaw",
    });

    expect(formatter.formatRelativeDay(lateUtc, new Date("2026-06-20T08:00:00.000Z"))).toBe(
      "Today",
    );
    expect(formatter.formatRelativeDay(lateUtc, new Date("2026-06-21T08:00:00.000Z"))).toBe(
      "Yesterday",
    );
  });
});
