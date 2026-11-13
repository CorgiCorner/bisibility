import { shiftDay } from "./calendar";

/**
 * Joinable 30-day challenge. It is separate from the 7-day presence and
 * practice streaks: a missed day pauses the count and never resets it.
 *
 * Done days are practice activity on or after `joinedOn` and on or before
 * the effective today. The effective today is `leftOn` while the user has
 * left, otherwise `today`. The day number is how many of those days are
 * done, capped at 30 for the "Day n of 30" line. `doneCount` keeps the raw
 * total. The badge is earned on the 30th done day (`earnedDay`).
 *
 * Calendar slots are calendar days, at most 30:
 * - While the effective today is still inside the first 30 days from
 *   `joinedOn`, the window is that first span, including upcoming days.
 * - After that, the window is the 30 calendar days ending on the effective
 *   today. `overflowDays` is how many earlier calendar days are not drawn.
 * A day before the effective today with no practice is `skipped`. The
 * effective today without practice is `today`, not skipped. Days after it
 * are `upcoming`. Days after `leftOn` and before the real today are
 * `skipped` and the count stays frozen. Joining again clears `leftOn`, so
 * practice in that gap counts and days without practice stay skipped.
 */
export const THIRTY_DAYS_KIND = "thirty_days" as const;
export const THIRTY_DAYS_DEFINITION_VERSION = 1;
export const THIRTY_DAYS_GOAL = 30;

export type ThirtyDaySlotState = "done" | "skipped" | "today" | "upcoming";
export type ThirtyDaySlot = { day: string; state: ThirtyDaySlotState; today: boolean };
export type ThirtyDayEnrollment = { joinedOn: string; leftOn: string | null };
export type ThirtyDayProgress = {
  joinedOn: string;
  leftOn: string | null;
  dayNumber: number;
  doneCount: number;
  earned: boolean;
  earnedDay: string | null;
  paused: boolean;
  overflowDays: number;
  slots: ThirtyDaySlot[];
};

const DAY_MS = 86_400_000;

function slotState(
  day: string,
  today: string,
  leftOn: string | null,
  done: ReadonlySet<string>,
): ThirtyDaySlotState {
  if (day > today) return "upcoming";
  if (leftOn && day > leftOn) return day === today ? "today" : "skipped";
  if (done.has(day)) return "done";
  return day === today ? "today" : "skipped";
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS);
}

export function progressForThirtyDays(input: {
  joinedOn: string;
  leftOn: string | null;
  practiceDays: readonly string[];
  today: string;
}): ThirtyDayProgress {
  const effectiveToday = input.leftOn && input.leftOn < input.today ? input.leftOn : input.today;
  const done = new Set(
    input.practiceDays.filter((day) => day >= input.joinedOn && day <= effectiveToday),
  );
  const ordered = [...done].sort();
  const doneCount = ordered.length;
  const earned = doneCount >= THIRTY_DAYS_GOAL;
  const firstEnd = shiftDay(input.joinedOn, THIRTY_DAYS_GOAL - 1);
  const start =
    effectiveToday <= firstEnd ? input.joinedOn : shiftDay(effectiveToday, -(THIRTY_DAYS_GOAL - 1));
  const doneBefore = ordered.filter((day) => day < effectiveToday).length;
  return {
    joinedOn: input.joinedOn,
    leftOn: input.leftOn,
    dayNumber: Math.min(doneCount, THIRTY_DAYS_GOAL),
    doneCount,
    earned,
    earnedDay: earned ? ordered[THIRTY_DAYS_GOAL - 1] : null,
    paused:
      !earned &&
      (input.leftOn !== null || doneBefore < daysBetween(input.joinedOn, effectiveToday)),
    overflowDays: daysBetween(input.joinedOn, start),
    slots: Array.from({ length: THIRTY_DAYS_GOAL }, (_, index) => {
      const day = shiftDay(start, index);
      const state = slotState(day, input.today, input.leftOn, done);
      return { day, state, today: day === input.today && state !== "upcoming" };
    }),
  };
}

export function planJoin(
  current: ThirtyDayEnrollment | null,
  today: string,
): { kind: "joined" | "already_joined"; enrollment: ThirtyDayEnrollment } {
  if (current && current.leftOn === null) return { kind: "already_joined", enrollment: current };
  if (current) return { kind: "joined", enrollment: { joinedOn: current.joinedOn, leftOn: null } };
  return { kind: "joined", enrollment: { joinedOn: today, leftOn: null } };
}

export function planLeave(
  current: ThirtyDayEnrollment | null,
  today: string,
): { kind: "left" | "already_left"; enrollment: ThirtyDayEnrollment } | { kind: "not_joined" } {
  if (!current) return { kind: "not_joined" };
  if (current.leftOn) return { kind: "already_left", enrollment: current };
  return { kind: "left", enrollment: { joinedOn: current.joinedOn, leftOn: today } };
}
