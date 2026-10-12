export type ProviderHistoryWindow = Readonly<{ dateFrom: string; dateTo: string }>;

export const BACKLINK_HISTORY_MONTHS = 12;
export const DOMAIN_HISTORY_MONTHS = 6;

/** Freeze full UTC calendar months before quoting or awaiting provider work. */
export function previousFullHistoryMonths(months: number, now = new Date()): ProviderHistoryWindow {
  if (!Number.isSafeInteger(months) || months < 1 || !Number.isFinite(now.getTime()))
    throw new RangeError("Invalid history window");
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return Object.freeze({
    dateFrom: new Date(Date.UTC(year, month - months, 1)).toISOString().slice(0, 10),
    dateTo: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  });
}
