import type { LocalHistoryWindow } from "./model";
export const LOCAL_HISTORY_DAYS = [7, 28, 90] as const;
/** Elapsed-day presets end at the frozen report instant; display uses the reader's report timezone. */
export function localHistoryRange(window: LocalHistoryWindow | undefined, asOf: string) {
  if (!window?.from) return "all";
  const duration = Date.parse(window.to) - Date.parse(window.from);
  return window.to === asOf && LOCAL_HISTORY_DAYS.some((days) => days * 86400000 === duration)
    ? String(duration / 86400000)
    : "custom";
}
export function localHistoryHref(
  href: string,
  asOf: string,
  window?: LocalHistoryWindow,
  runId?: string,
) {
  const query = new URLSearchParams({ asOf });
  if (window?.from) query.set("from", window.from);
  if (window) query.set("to", window.to);
  if (runId) query.set("run", runId);
  return `${href}?${query}`;
}
export function localHistoryPresetHref(href: string, asOf: string, range: string) {
  if (range === "all") return localHistoryHref(href, asOf);
  const days = LOCAL_HISTORY_DAYS.find((value) => String(value) === range);
  if (days === undefined) return null;
  const from = new Date(Date.parse(asOf) - days * 86400000);
  if (!Number.isFinite(from.getTime()) || from.getTime() < 0) return null;
  return localHistoryHref(href, asOf, {
    from: from.toISOString(),
    to: asOf,
    timeBasis: "occurrence_created_at",
  });
}
