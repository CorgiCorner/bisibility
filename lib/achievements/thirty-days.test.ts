import { describe, expect, it } from "vitest";
import { calendarDay, shiftDay } from "./calendar";
import {
  planJoin,
  planLeave,
  progressForThirtyDays,
  THIRTY_DAYS_DEFINITION_VERSION,
  THIRTY_DAYS_GOAL,
} from "./thirty-days";

const joinedOn = "2026-11-01";
function days(start: string, count: number, step = 1) {
  return Array.from({ length: count }, (_, index) => shiftDay(start, index * step));
}

describe("30-day challenge progress", () => {
  it("counts practice days after joining and pauses on a skip instead of resetting", () => {
    const progress = progressForThirtyDays({
      joinedOn,
      leftOn: null,
      practiceDays: ["2026-10-31", joinedOn, "2026-11-03", "2026-11-03", "2026-11-04"],
      today: "2026-11-04",
    });
    expect(progress).toMatchObject({
      dayNumber: 3,
      doneCount: 3,
      earned: false,
      earnedDay: null,
      paused: true,
      overflowDays: 0,
    });
    expect(progress.slots).toHaveLength(THIRTY_DAYS_GOAL);
    expect(progress.slots.find((slot) => slot.day === "2026-11-02")).toMatchObject({
      state: "skipped",
    });
    expect(progress.slots.find((slot) => slot.day === "2026-11-04")).toMatchObject({
      state: "done",
      today: true,
    });
    expect(progress.slots.find((slot) => slot.day === "2026-11-05")).toMatchObject({
      state: "upcoming",
    });
    expect(progress.slots[0]).toMatchObject({ day: joinedOn, state: "done" });
  });

  it("earns on the 30th done day even when skipped days make the calendar longer", () => {
    const practiceDays = days(joinedOn, 30, 2);
    const today = practiceDays[29];
    const progress = progressForThirtyDays({
      joinedOn,
      leftOn: null,
      practiceDays,
      today,
    });
    expect(progress.earned).toBe(true);
    expect(progress.earnedDay).toBe(today);
    expect(progress.doneCount).toBe(30);
    expect(progress.dayNumber).toBe(30);
    expect(progress.paused).toBe(false);
    expect(progress.overflowDays).toBeGreaterThan(0);
    expect(progress.slots).toHaveLength(30);
    expect(progress.slots[0].day).toBe(shiftDay(today, -29));
    expect(progress.slots.at(-1)?.day).toBe(today);
    const later = progressForThirtyDays({
      joinedOn,
      leftOn: null,
      practiceDays: [...practiceDays, shiftDay(today, 2)],
      today: shiftDay(today, 2),
    });
    expect(later.earnedDay).toBe(today);
    expect(later.doneCount).toBe(31);
  });

  it("keeps today unfinished and freezes the window on the day the user leaves", () => {
    const open = progressForThirtyDays({
      joinedOn,
      leftOn: null,
      practiceDays: [joinedOn],
      today: joinedOn,
    });
    expect(open).toMatchObject({ dayNumber: 1, paused: false, overflowDays: 0 });
    expect(open.slots.find((slot) => slot.day === joinedOn)?.state).toBe("done");

    const waiting = progressForThirtyDays({
      joinedOn,
      leftOn: null,
      practiceDays: [joinedOn],
      today: "2026-11-02",
    });
    expect(waiting.slots.find((slot) => slot.day === "2026-11-02")).toMatchObject({
      state: "today",
      today: true,
    });
    expect(waiting.doneCount).toBe(1);

    const left = progressForThirtyDays({
      joinedOn,
      leftOn: "2026-11-05",
      practiceDays: days(joinedOn, 20),
      today: "2026-11-20",
    });
    expect(left).toMatchObject({
      doneCount: 5,
      dayNumber: 5,
      earned: false,
      paused: true,
      overflowDays: 0,
    });
    expect(left.slots.at(-1)?.day).toBe("2026-11-30");
    expect(left.slots.find((slot) => slot.day === "2026-11-06")?.state).toBe("skipped");
    expect(left.slots.find((slot) => slot.day === "2026-11-20")).toMatchObject({
      state: "today",
      today: true,
    });
    expect(left.slots.find((slot) => slot.day === "2026-11-21")?.state).toBe("upcoming");
  });

  it("uses the caller's zoned today so a boundary hour does not skip the local day", () => {
    const instant = new Date("2026-11-08T23:30:00Z");
    const warsaw = progressForThirtyDays({
      joinedOn: "2026-11-07",
      leftOn: null,
      practiceDays: ["2026-11-07", "2026-11-08"],
      today: calendarDay(instant, "Europe/Warsaw"),
    });
    const newYork = progressForThirtyDays({
      joinedOn: "2026-11-07",
      leftOn: null,
      practiceDays: ["2026-11-07"],
      today: calendarDay(instant, "America/New_York"),
    });
    expect(warsaw.slots.find((slot) => slot.day === "2026-11-09")).toMatchObject({
      state: "today",
    });
    expect(warsaw.doneCount).toBe(2);
    expect(newYork.slots.find((slot) => slot.day === "2026-11-08")).toMatchObject({
      state: "today",
    });
    expect(newYork.slots.find((slot) => slot.day === "2026-11-08")?.state).not.toBe("skipped");
    expect(newYork.doneCount).toBe(1);
  });
});

describe("30-day enrollment changes", () => {
  it("joins on any day, resumes without moving Day 1, and leaves once", () => {
    expect(THIRTY_DAYS_DEFINITION_VERSION).toBe(1);
    const joined = planJoin(null, "2026-11-07");
    expect(joined).toEqual({
      kind: "joined",
      enrollment: { joinedOn: "2026-11-07", leftOn: null },
    });
    expect(planJoin(joined.enrollment, "2026-11-08")).toEqual({
      kind: "already_joined",
      enrollment: joined.enrollment,
    });
    const left = planLeave(joined.enrollment, "2026-11-09");
    expect(left).toEqual({
      kind: "left",
      enrollment: { joinedOn: "2026-11-07", leftOn: "2026-11-09" },
    });
    if (left.kind !== "left") throw new Error("expected leave");
    expect(planLeave(left.enrollment, "2026-11-10").kind).toBe("already_left");
    expect(planJoin(left.enrollment, "2026-11-12")).toEqual({
      kind: "joined",
      enrollment: { joinedOn: "2026-11-07", leftOn: null },
    });
    expect(planLeave(null, "2026-11-12")).toEqual({ kind: "not_joined" });
  });
});
