import { describe, expect, it } from "vitest";
import { calendarDay, nextMorning, shiftDay } from "./calendar";
import { progressForDays } from "./progress";
import { qualifiesPractice } from "./qualification";

const week = Array.from({ length: 7 }, (_, i) => shiftDay("2026-10-10", i));
describe("calendar achievements", () => {
  it("awards seven distinct consecutive days once and keeps yesterday's live streak", () => {
    const value = progressForDays([...week, ...week], "2026-10-17");
    expect(value).toMatchObject({
      current: 7,
      longest: 7,
      earnedDay: "2026-10-16",
      lastDay: "2026-10-16",
    });
    expect(progressForDays(week, "2026-10-18")).toMatchObject({
      current: 0,
      longest: 7,
      earnedDay: "2026-10-16",
    });
  });
  it("does not join gaps or count future days", () => {
    expect(
      progressForDays([...week.slice(0, 5), "2026-10-16", "2026-10-18"], "2026-10-16"),
    ).toMatchObject({ current: 1, longest: 5, earnedDay: null });
  });
  it("uses the pinned zone at midnight, month and year boundaries", () => {
    expect(calendarDay(new Date("2027-01-01T00:30:00Z"), "America/New_York")).toBe("2026-12-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("schedules next morning through both DST transitions", () => {
    expect(nextMorning("2026-03-28", "Europe/Warsaw").toISOString()).toBe(
      "2026-03-29T07:00:00.000Z",
    );
    expect(nextMorning("2026-10-24", "Europe/Warsaw").toISOString()).toBe(
      "2026-10-25T08:00:00.000Z",
    );
    expect(nextMorning("2026-10-16", "Asia/Kathmandu").toISOString()).toBe(
      "2026-10-17T03:15:00.000Z",
    );
  });
  it("only accepts successful explicit human operations", () => {
    const request = { actorId: "user-a", operation: "researchKeywords", success: true };
    expect(qualifiesPractice(request)).toBe(true);
    for (const extra of [
      { actorId: null },
      { success: false },
      { background: true },
      { estimate: true },
      { operation: "health" },
      { operation: "getUsage" },
    ])
      expect(qualifiesPractice({ ...request, ...extra })).toBe(false);
  });
});
