import { describe, expect, it } from "vitest";
import { keywordHistoryWindows, reportCalendarDayStart } from "./history-calendar";

describe("history report calendar", () => {
  it("uses a 23-hour local day across spring DST", () => {
    const start = reportCalendarDayStart("2026-03-29", "Europe/Warsaw");
    const next = reportCalendarDayStart("2026-03-30", "Europe/Warsaw");
    expect(start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(next.getTime() - start.getTime()).toBe(23 * 3_600_000);
  });
  it("uses a 25-hour local day across autumn DST", () => {
    const start = reportCalendarDayStart("2026-10-25", "Europe/Warsaw");
    const next = reportCalendarDayStart("2026-10-26", "Europe/Warsaw");
    expect(next.getTime() - start.getTime()).toBe(25 * 3_600_000);
  });
  it("keeps the watermark and includes seven local dates rather than seven UTC midnights", () => {
    const windows = keywordHistoryWindows(new Date("2026-10-12T10:00:00Z"), "Europe/Warsaw");
    expect(windows.map(({ id }) => id)).toEqual(["7d", "30d", "90d"]);
    expect(windows[0].window).toEqual({
      basis: "observed_at",
      from: "2026-10-05T22:00:00.000Z",
      to: "2026-10-12T10:00:00.000Z",
    });
  });
  it("handles a skipped midnight without inventing a 00:00 observation", () => {
    expect(reportCalendarDayStart("2018-11-04", "America/Sao_Paulo").toISOString()).toBe(
      "2018-11-04T03:00:00.000Z",
    );
  });
  it("rejects absent calendar dates and invalid time zones", () => {
    expect(() => reportCalendarDayStart("2011-12-30", "Pacific/Apia")).toThrow();
    expect(() => keywordHistoryWindows(new Date(), "invalid-zone")).toThrow();
    expect(() => reportCalendarDayStart("2026-02-30", "UTC")).toThrow();
  });
});
