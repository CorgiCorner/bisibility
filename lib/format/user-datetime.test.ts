import { describe, expect, it } from "vitest";
import { createUserDateTimeFormatter } from "./user-datetime";

const lateUtc = new Date("2026-06-19T23:30:00.000Z");

describe("user date/time formatter", () => {
  it("formats date-only labels in the selected timezone", () => {
    expect(
      createUserDateTimeFormatter({
        dateFormat: "iso",
        language: "en",
        timezone: "UTC",
      }).formatDate(lateUtc),
    ).toBe("2026-06-19");

    expect(
      createUserDateTimeFormatter({
        dateFormat: "iso",
        language: "en",
        timezone: "Europe/Warsaw",
      }).formatDate(lateUtc),
    ).toBe("2026-06-20");
  });

  it("honors the persisted date format variants", () => {
    expect(
      createUserDateTimeFormatter({
        dateFormat: "eu",
        language: "en",
        timezone: "Europe/Warsaw",
      }).formatDate(lateUtc),
    ).toBe("20/06/2026");

    expect(
      createUserDateTimeFormatter({
        dateFormat: "long",
        language: "en",
        timezone: "Europe/Warsaw",
      }).formatDate(lateUtc),
    ).toBe("Jun 20, 2026");
  });

  it("formats clock labels in the selected timezone", () => {
    expect(
      createUserDateTimeFormatter({
        dateFormat: "iso",
        language: "en",
        timezone: "America/New_York",
      }).formatTime(lateUtc),
    ).toBe("19:30");
  });

  it("formats a human-readable date and time through one preference set", () => {
    expect(
      createUserDateTimeFormatter({
        dateFormat: "long",
        language: "en",
        timezone: "UTC",
      }).formatDateTime(new Date("2026-07-18T13:40:00.000Z")),
    ).toBe("Jul 18, 2026, 13:40");
  });

  it("uses timezone-aware day labels for activity grouping", () => {
    const formatter = createUserDateTimeFormatter({
      dateFormat: "iso",
      language: "en",
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
