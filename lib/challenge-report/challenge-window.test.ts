import { describe, expect, it } from "vitest";
import {
  CHALLENGE_WINDOW_DAYS,
  canMarkChallengeDay,
  challengeProgress,
  challengeWindow,
  insideChallengeWindow,
} from "./challenge-window";

describe("project challenge window", () => {
  it("is exactly 30 calendar days from the start day, across a month end", () => {
    expect(challengeWindow("2026-10-20")).toEqual({ start: "2026-10-20", end: "2026-11-18" });
    expect(insideChallengeWindow("2026-10-19", "2026-10-20")).toBe(false);
    expect(insideChallengeWindow("2026-11-18", "2026-10-20")).toBe(true);
    expect(insideChallengeWindow("2026-11-19", "2026-10-20")).toBe(false);
    expect(challengeWindow("2028-02-15").end).toBe("2028-03-15");
  });

  it("counts Day 30 as the last open day and ends the day after", () => {
    const day30 = challengeProgress({
      checkedDays: [],
      joinedOn: "2026-10-20",
      today: "2026-11-18",
    });
    expect(day30).toMatchObject({ elapsedDays: 30, ended: false, earnedDay: null });
    const after = challengeProgress({
      checkedDays: [],
      joinedOn: "2026-10-20",
      today: "2026-11-19",
    });
    expect(after).toMatchObject({ elapsedDays: 30, ended: true, earnedDay: "2026-11-18" });
  });

  it("completes with missed days and counts check-ins separately from elapsed days", () => {
    const progress = challengeProgress({
      checkedDays: ["2026-10-20", "2026-10-22", "2026-11-18"],
      joinedOn: "2026-10-20",
      today: "2026-12-01",
    });
    expect(progress.ended).toBe(true);
    expect(progress.checkInCount).toBe(3);
    expect(progress.elapsedDays).toBe(CHALLENGE_WINDOW_DAYS);
    expect(progress.days).toHaveLength(CHALLENGE_WINDOW_DAYS);
    expect(progress.days.filter((day) => day.state === "missed")).toHaveLength(27);
  });

  it("counts a repeated or duplicated day once and ignores days outside the window", () => {
    const progress = challengeProgress({
      // A visit, a manual mark and a legacy work day can all name the same day.
      checkedDays: ["2026-10-21", "2026-10-21", "2026-10-21", "2026-10-19", "2026-11-19"],
      joinedOn: "2026-10-20",
      today: "2026-10-25",
    });
    expect(progress.checkInCount).toBe(1);
    expect(progress.elapsedDays).toBe(6);
  });

  it("never marks future days, allows past window days, and allows corrections after the end", () => {
    expect(canMarkChallengeDay("2026-10-26", "2026-10-20", "2026-10-25")).toBe(false);
    expect(canMarkChallengeDay("2026-10-25", "2026-10-20", "2026-10-25")).toBe(true);
    expect(canMarkChallengeDay("2026-10-21", "2026-10-20", "2026-10-25")).toBe(true);
    expect(canMarkChallengeDay("2026-10-19", "2026-10-20", "2026-10-25")).toBe(false);
    expect(canMarkChallengeDay("2026-11-02", "2026-10-20", "2027-01-05")).toBe(true);
    expect(canMarkChallengeDay("2026-11-19", "2026-10-20", "2027-01-05")).toBe(false);
    const progress = challengeProgress({
      checkedDays: ["2026-10-20"],
      joinedOn: "2026-10-20",
      today: "2026-10-22",
    });
    expect(progress.days.slice(0, 4).map(({ markable, state }) => ({ markable, state }))).toEqual([
      { markable: false, state: "checked" },
      { markable: true, state: "missed" },
      { markable: true, state: "today" },
      { markable: false, state: "upcoming" },
    ]);
  });
});
