import { shiftDay } from "@/lib/achievements/calendar";

/**
 * The project SEO challenge is exactly 30 calendar days, counted in the
 * enrollment time zone from the explicit start day (`joinedOn`, Day 1) to
 * `joinedOn + 29` (Day 30). There is no pause, extension or reset. It is
 * separate from the account-wide 30-day achievement in `lib/achievements`.
 *
 * A day is checked in at most once. Visits, the start itself and manual marks
 * all write the same day key. The badge and the challenge report unlock when
 * the window has ended (the day after Day 30), however many days were checked
 * in. Missed days inside the window may still be marked after it ends; future
 * days and days outside the window never can.
 */
export const CHALLENGE_WINDOW_DAYS = 30;

export type ChallengeDayState = "checked" | "missed" | "today" | "upcoming";
export type ChallengeDay = {
  day: string;
  index: number;
  markable: boolean;
  state: ChallengeDayState;
};

export function challengeWindow(joinedOn: string) {
  return { start: joinedOn, end: shiftDay(joinedOn, CHALLENGE_WINDOW_DAYS - 1) };
}

export function insideChallengeWindow(day: string, joinedOn: string) {
  const { start, end } = challengeWindow(joinedOn);
  return day >= start && day <= end;
}

/** A manual mark is allowed for a window day that is not in the future. */
export function canMarkChallengeDay(day: string, joinedOn: string, today: string) {
  return insideChallengeWindow(day, joinedOn) && day <= today;
}

export function challengeProgress(input: {
  checkedDays: readonly string[];
  joinedOn: string;
  today: string;
}) {
  const { start, end } = challengeWindow(input.joinedOn);
  const checked = new Set(input.checkedDays.filter((day) => day >= start && day <= end));
  const ended = input.today > end;
  const elapsed =
    input.today < start
      ? 0
      : ended
        ? CHALLENGE_WINDOW_DAYS
        : Math.round(
            (Date.parse(`${input.today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
              86_400_000,
          ) + 1;
  const days: ChallengeDay[] = Array.from({ length: CHALLENGE_WINDOW_DAYS }, (_, index) => {
    const day = shiftDay(start, index);
    const state: ChallengeDayState = checked.has(day)
      ? "checked"
      : day > input.today
        ? "upcoming"
        : day === input.today
          ? "today"
          : "missed";
    return {
      day,
      index: index + 1,
      markable: state !== "checked" && canMarkChallengeDay(day, input.joinedOn, input.today),
      state,
    };
  });
  return {
    checkInCount: checked.size,
    days,
    elapsedDays: elapsed,
    end,
    ended,
    /** The badge and report day. Set only once the window has ended. */
    earnedDay: ended ? end : null,
    start,
  };
}

export type ChallengeProgress = ReturnType<typeof challengeProgress>;
