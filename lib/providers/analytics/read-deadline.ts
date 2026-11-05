export function analyticsReadDeadlineMs(configured = process.env.ANALYTICS_READ_TIMEOUT_MS) {
  const value = configured?.trim() ?? "";
  const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1_000 && parsed <= 120_000 ? parsed : 25_000;
}
