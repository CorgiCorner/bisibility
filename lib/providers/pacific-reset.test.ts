import { describe, expect, it } from "vitest";
import { nextPacificMidnight, pacificDate, pacificDay } from "./pacific-reset";

describe("nextPacificMidnight", () => {
  it.each([
    ["2026-10-24T12:00:00Z", "2026-10-25T07:00:00.000Z"],
    ["2026-10-26T12:00:00Z", "2026-10-27T07:00:00.000Z"],
    ["2026-10-31T12:00:00Z", "2026-11-01T07:00:00.000Z"],
    ["2026-11-01T12:00:00Z", "2026-11-02T08:00:00.000Z"],
    ["2026-11-02T12:00:00Z", "2026-11-03T08:00:00.000Z"],
    ["2026-10-24T06:59:59.999Z", "2026-10-24T07:00:00.000Z"],
    ["2026-10-24T07:00:00.000Z", "2026-10-25T07:00:00.000Z"],
    ["2026-10-24T07:00:00.001Z", "2026-10-25T07:00:00.000Z"],
    ["2026-03-08T09:00:00Z", "2026-03-09T07:00:00.000Z"],
    ["2026-03-08T07:59:59.999Z", "2026-03-08T08:00:00.000Z"],
    ["2026-12-31T12:00:00Z", "2027-01-01T08:00:00.000Z"],
  ])("maps %s to %s without mutating input", (instant, expected) => {
    const now = new Date(instant);
    expect(nextPacificMidnight(now).toISOString()).toBe(expected);
    expect(now.getTime()).toBe(Date.parse(instant));
  });

  it("resets at 08:00 Warsaw time after Europe's clock change", () => {
    const reset = nextPacificMidnight(new Date("2026-10-26T12:00:00Z"));
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Warsaw",
        hour: "2-digit",
        minute: "2-digit",
      }).format(reset),
    ).toBe("08:00");
  });
});

describe("Pacific inspection days", () => {
  it.each([
    ["2026-10-25T06:59:59Z", "2026-10-24", "2026-10-24T07:00:00.000Z", "2026-10-25T07:00:00.000Z"],
    ["2026-10-25T07:00:00Z", "2026-10-25", "2026-10-25T07:00:00.000Z", "2026-10-26T07:00:00.000Z"],
    ["2026-11-01T12:00:00Z", "2026-11-01", "2026-11-01T07:00:00.000Z", "2026-11-02T08:00:00.000Z"],
    ["2026-03-08T12:00:00Z", "2026-03-08", "2026-03-08T08:00:00.000Z", "2026-03-09T07:00:00.000Z"],
  ])("bounds %s across reset and DST", (at, date, start, end) => {
    expect(pacificDate(new Date(at))).toBe(date);
    const day = pacificDay(new Date(at));
    expect(day.gte.toISOString()).toBe(start);
    expect(day.lt.toISOString()).toBe(end);
  });
});
