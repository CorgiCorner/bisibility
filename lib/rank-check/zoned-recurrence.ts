import { CronExpressionParser } from "cron-parser";
import { DAILY_INTERVAL_MS, stableIntervalPhaseMs, WEEKLY_INTERVAL_MS } from "./interval-phase";

type ZonedIntervalFrequency = "daily" | "weekly";

const DAY_SECONDS = DAILY_INTERVAL_MS / 1_000;
// Stable interval phases are measured from the Unix epoch, which started on Thursday.
const UNIX_EPOCH_WEEKDAY = 4;

export function stableZonedIntervalCron(keywordId: string, frequency: ZonedIntervalFrequency) {
  const intervalMs = frequency === "daily" ? DAILY_INTERVAL_MS : WEEKLY_INTERVAL_MS;
  const phaseSeconds = stableIntervalPhaseMs(keywordId, intervalMs) / 1_000;
  const secondOffset = phaseSeconds % 60;
  const minute = Math.floor(phaseSeconds / 60) % 60;
  const hour = Math.floor(phaseSeconds / 3_600) % 24;
  const weekday =
    frequency === "weekly"
      ? (UNIX_EPOCH_WEEKDAY + Math.floor(phaseSeconds / DAY_SECONDS)) % 7
      : "*";

  return {
    cronExpression: `${minute} ${hour} * * ${weekday}`,
    secondOffset,
  };
}

export function nextZonedCron(
  cronExpression: string,
  timezone: string,
  from: Date,
  offsetSeconds = 0,
) {
  const offsetMs = offsetSeconds * 1_000;
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(from.getTime() - offsetMs),
    tz: timezone,
  });
  let next = new Date(interval.next().getTime() + offsetMs);
  if (next <= from) {
    next = new Date(interval.next().getTime() + offsetMs);
  }
  return next;
}
