import {
  DEFAULT_WINDOW_ID,
  RETENTION_MONTHS,
  WINDOW_PRESETS,
  type WindowPresetId,
  YOY_MIN_HISTORY_MONTHS,
} from "@/lib/search-insights/constants";
import { dateKey } from "@/lib/search-insights/dates";

export type SearchInsightsPeriod = {
  days: number;
  id: WindowPresetId;
  label: string;
  sub: string;
};

export type SearchInsightsPropertyKind = "domain" | "url-prefix";

export type SearchInsightsProperty = {
  displayName: string;
  kind: SearchInsightsPropertyKind;
  kindLabel: string;
  value: string;
};

export type SearchInsightsYoy = {
  monthsImported: number;
  required: number;
};

const DOMAIN_PREFIX = "sc-domain:";

export const PROPERTY_KIND_LABELS = {
  domain: "domain",
  "url-prefix": "url prefix",
} as const satisfies Record<SearchInsightsPropertyKind, string>;

export function propertyKind(value: string): SearchInsightsPropertyKind {
  return value.startsWith(DOMAIN_PREFIX) ? "domain" : "url-prefix";
}

// The sc-domain: prefix is request syntax, not a name, so it never reaches the screen.
export function propertyDisplayName(value: string) {
  return value.startsWith(DOMAIN_PREFIX) ? value.slice(DOMAIN_PREFIX.length) : value;
}

export function searchInsightsProperty(value: string): SearchInsightsProperty {
  const kind = propertyKind(value);
  return {
    displayName: propertyDisplayName(value),
    kind,
    kindLabel: PROPERTY_KIND_LABELS[kind],
    value,
  };
}

export function resolvePeriod(raw: string | undefined): SearchInsightsPeriod {
  const preset =
    WINDOW_PRESETS.find((candidate) => candidate.id === raw) ??
    WINDOW_PRESETS.find((candidate) => candidate.id === DEFAULT_WINDOW_ID);
  if (!preset) throw new Error("No comparison window preset is configured.");
  return { days: preset.days, id: preset.id, label: preset.label, sub: preset.sub };
}

// Whole months only: a partial month of history does not make a year-over-year comparison honest.
export function wholeMonthsBetween(from: string, to: string) {
  if (from > to) return 0;
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const months = (toYear - fromYear) * 12 + (toMonth - fromMonth) - (toDay < fromDay ? 1 : 0);
  return Math.max(0, months);
}

type ImportHistoryDates = {
  cursorDate: Date | null;
  earliestTargetDate: Date | null;
  finalizedThroughDate: Date | null;
};

/**
 * The backfill walks backward, so the oldest day it has reached is the honest floor of the
 * stored history; before it starts, the planned earliest day is the only estimate available.
 */
export function yoyState(row: ImportHistoryDates | null): SearchInsightsYoy {
  const oldest = row?.cursorDate ?? row?.earliestTargetDate ?? null;
  const newest = row?.finalizedThroughDate ?? null;
  const monthsImported =
    oldest && newest ? wholeMonthsBetween(dateKey(oldest), dateKey(newest)) : 0;
  return {
    monthsImported: Math.min(monthsImported, RETENTION_MONTHS),
    required: YOY_MIN_HISTORY_MONTHS,
  };
}
