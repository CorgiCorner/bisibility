import { calendarDay, shiftDay } from "@/lib/achievements/calendar";

/**
 * Last day a daily series may plot. Today is incomplete. A source freshness date
 * earlier than today wins; otherwise the series ends yesterday in the project time zone.
 * A requested end already in the past is left unchanged.
 */
export function completeSeriesEnd(input: {
  freshness?: string | null;
  now: Date;
  requestedEnd: string;
  timeZone: string;
}) {
  const today = calendarDay(input.now, input.timeZone);
  if (input.requestedEnd < today) return input.requestedEnd;
  const freshness = input.freshness && input.freshness < today ? input.freshness : null;
  const cap = freshness ?? shiftDay(today, -1);
  return cap < input.requestedEnd ? cap : input.requestedEnd;
}
