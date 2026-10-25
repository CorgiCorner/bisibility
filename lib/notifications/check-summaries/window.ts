export const SUMMARY_GRACE_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;
export type SummaryWindow = { start: Date; end: Date };

export function checkWindow(check: { finishedAt: Date | null; checkedAt: Date }): SummaryWindow {
  const time = (check.finishedAt ?? check.checkedAt).getTime();
  const start = new Date(Math.floor(time / HOUR_MS) * HOUR_MS);
  return { start, end: new Date(start.getTime() + HOUR_MS) };
}

export function summaryWritable(end: Date, now: Date) {
  return now >= end && now.getTime() < end.getTime() + SUMMARY_GRACE_MS;
}

export function persistedWithinCutoff(persistedAt: Date | null, end: Date) {
  return persistedAt !== null && persistedAt.getTime() < end.getTime() + SUMMARY_GRACE_MS;
}

export function inWindow(
  check: { finishedAt: Date | null; checkedAt: Date },
  window: SummaryWindow,
) {
  const time = check.finishedAt ?? check.checkedAt;
  return time >= window.start && time < window.end;
}
