export const WEEK_MS = 168 * 60 * 60 * 1000;

export function weeklyDigestPeriod(periodEnd: Date) {
  if (!Number.isFinite(periodEnd.getTime())) throw new Error("Invalid digest time.");
  return { periodEnd: new Date(periodEnd), periodStart: new Date(periodEnd.getTime() - WEEK_MS) };
}
