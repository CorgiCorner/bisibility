import { CronExpressionParser } from "cron-parser";

export function nextTrackingOccurrence(cron: string, timezone: string, after: Date) {
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  return CronExpressionParser.parse(cron, { tz: timezone, currentDate: after }).next().toDate();
}
export function trackingOccurrenceKey(scheduleId: string, plannedAt: Date) {
  return `tracking-schedule:${scheduleId}:${plannedAt.toISOString()}`;
}
