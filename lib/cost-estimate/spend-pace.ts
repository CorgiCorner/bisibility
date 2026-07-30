export function projectedMonthlySpendCents(spentCents: number, now: Date): number | null {
  const daysElapsed = now.getUTCDate();
  if (daysElapsed <= 2) {
    return null;
  }

  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Math.round((Math.max(0, spentCents) * daysInMonth) / daysElapsed);
}
