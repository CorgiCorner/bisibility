import {
  addDays,
  dateFromKey,
  dateKey,
  diffDays,
  finalizedWindow,
  formatDateLabel,
  formatPacificTimestamp,
  monthsBefore,
  pacificToday,
} from "@/lib/search-insights/dates";
import { dateFromFrozenNow, dateOnlyFromFrozenNow, FROZEN_NOW } from "@/tests/clock";
import { describe, expect, it } from "vitest";

describe("date keys", () => {
  it("round-trips a key through UTC midnight", () => {
    const value = dateFromKey("2026-08-17");
    expect(value.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(dateKey(value)).toBe("2026-08-17");
  });

  it("rejects a malformed key", () => {
    expect(() => dateFromKey("17-08-2026")).toThrow(/Invalid date key/u);
  });

  it("rejects a well-shaped key for a day that does not exist", () => {
    expect(() => dateFromKey("2026-02-30")).toThrow(/Invalid date key/u);
    expect(() => dateFromKey("2026-13-01")).toThrow(/Invalid date key/u);
  });

  it("adds days across a year boundary", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("counts whole days in both directions", () => {
    expect(diffDays("2026-06-01", "2026-06-30")).toBe(29);
    expect(diffDays("2026-06-30", "2026-06-01")).toBe(-29);
  });

  it("labels a day the way the tables read it", () => {
    expect(formatDateLabel("2026-08-17")).toBe("Aug 17, 2026");
  });
});

describe("pacificToday", () => {
  it("uses the Pacific calendar day, not the UTC one", () => {
    expect(pacificToday(FROZEN_NOW)).toBe(dateOnlyFromFrozenNow());
  });

  it("stays on the previous day one hour before Pacific midnight", () => {
    expect(pacificToday(dateFromFrozenNow({ hours: 7 }))).toBe(dateOnlyFromFrozenNow());
  });

  it("rolls over at Pacific midnight, not at UTC midnight", () => {
    expect(pacificToday(dateFromFrozenNow({ hours: 8 }))).toBe(dateOnlyFromFrozenNow({ days: 1 }));
  });
});

describe("monthsBefore", () => {
  it("crosses a year boundary", () => {
    expect(monthsBefore("2026-01-15", 16)).toBe("2024-09-15");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2026-05-31", 3)).toBe("2026-02-28");
  });

  it("keeps the day of month when it exists", () => {
    expect(monthsBefore("2026-08-17", 16)).toBe("2025-04-17");
  });
});

describe("finalizedWindow", () => {
  it("ends the current block on the newest finalized day", () => {
    expect(finalizedWindow("2026-06-30", 28)).toEqual({
      current: { end: "2026-06-30", start: "2026-06-03" },
      previous: { end: "2026-06-02", start: "2026-05-06" },
    });
  });

  it("makes the previous block immediately precede the current one", () => {
    const window = finalizedWindow("2026-03-02", 7);
    expect(window).toEqual({
      current: { end: "2026-03-02", start: "2026-02-24" },
      previous: { end: "2026-02-23", start: "2026-02-17" },
    });
    expect(diffDays(window.previous.end, window.current.start)).toBe(1);
    expect(diffDays(window.current.start, window.current.end)).toBe(6);
    expect(diffDays(window.previous.start, window.previous.end)).toBe(6);
  });

  it("degenerates to a single day window", () => {
    expect(finalizedWindow("2026-06-30", 1)).toEqual({
      current: { end: "2026-06-30", start: "2026-06-30" },
      previous: { end: "2026-06-29", start: "2026-06-29" },
    });
  });
});

describe("formatPacificTimestamp", () => {
  it("renders the fresh-through line in Pacific time", () => {
    expect(formatPacificTimestamp(FROZEN_NOW)).toBe("Jul 10, 16:00 Pacific");
  });

  it("pads the hour to two digits", () => {
    expect(formatPacificTimestamp(dateFromFrozenNow({ hours: 15 }))).toBe("Jul 11, 07:00 Pacific");
  });
});
