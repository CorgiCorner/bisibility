import { lookupFailure } from "./outcomes";

export function utcDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z") ? date : null;
}

function monthAgo(now: Date) {
  const start = new Date(now);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  start.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return start;
}

export function metadataWindow(from: string, to: string, now: Date) {
  const start = utcDate(from);
  const end = utcDate(to);
  if (!start || !end || start >= end || end > now) {
    return lookupFailure("operator_review", "invalid_original_utc_window");
  }
  if (start <= monthAgo(now)) {
    return lookupFailure("finally_unknown", "provider_metadata_retention_expired");
  }
  return null;
}

export function resultRetention(submittedAt: string, now: Date) {
  const date = utcDate(submittedAt);
  if (!date || date > now)
    return lookupFailure("operator_review", "invalid_original_submission_time");
  return now.getTime() - date.getTime() >= 30 * 86_400_000
    ? lookupFailure("finally_unknown", "provider_result_retention_expired")
    : null;
}

export function providerDatetime(value: string) {
  return `${new Date(value).toISOString().slice(0, 19).replace("T", " ")} +00:00`;
}
