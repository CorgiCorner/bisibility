import { shiftDay } from "./calendar";
export const badgeKinds = ["presence", "practice"] as const;
export type BadgeKind = (typeof badgeKinds)[number];
export type Progress = {
  current: number;
  longest: number;
  lastDay: string | null;
  earnedDay: string | null;
  days: string[];
};
export function progressForDays(input: readonly string[], today: string): Progress {
  const days = [...new Set(input)].filter((day) => day <= today).sort();
  let streak = 0,
    longest = 0,
    previous: string | null = null,
    earnedDay: string | null = null;
  for (const day of days) {
    streak = previous && shiftDay(previous, 1) === day ? streak + 1 : 1;
    longest = Math.max(longest, streak);
    if (streak >= 7 && !earnedDay) earnedDay = day;
    previous = day;
  }
  return {
    current: previous === today || previous === shiftDay(today, -1) ? streak : 0,
    longest,
    lastDay: previous,
    earnedDay,
    days: days.filter((day) => day >= shiftDay(today, -6)),
  };
}
