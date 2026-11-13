import { describe, expect, it } from "vitest";
import { buildDailyClickPoints, dailyClicksAreEmpty } from "./daily-clicks-model";

describe("buildDailyClickPoints", () => {
  it("keeps a real zero, leaves a missing finalized day empty, and drops days after the window", () => {
    const points = buildDailyClickPoints("2026-11-01", "2026-11-04", [
      { clicks: 0, dateKey: "2026-11-01" },
      { clicks: 12, dateKey: "2026-11-03" },
      { clicks: 40, dateKey: "2026-11-08" },
    ]);

    expect(points).toEqual([
      { clicks: 0, dateKey: "2026-11-01" },
      { clicks: null, dateKey: "2026-11-02" },
      { clicks: 12, dateKey: "2026-11-03" },
      { clicks: null, dateKey: "2026-11-04" },
    ]);
    expect(points.some((point) => point.dateKey > "2026-11-04")).toBe(false);
    expect(dailyClicksAreEmpty(points)).toBe(false);
  });

  it("treats a window with no stored clicks as empty", () => {
    const points = buildDailyClickPoints("2026-11-01", "2026-11-02", []);
    expect(dailyClicksAreEmpty(points)).toBe(true);
  });
});
