export const CONVERSION_SOURCES = ["ga4", "plausible"] as const;

export type ConversionSource = (typeof CONVERSION_SOURCES)[number];

export const GA4_KEY_EVENTS_NAME = "key_events";
export const GA4_KEY_EVENTS_DISPLAY_NAME = "Key events";

const CONVERSION_SOURCE_SET = new Set<string>(CONVERSION_SOURCES);

/**
 * GA4 key events in this package have no revenue. Plausible can return
 * `total_revenue`; the settings switch still waits until a stored row has it.
 */
const REPORTS_REVENUE: Record<ConversionSource, boolean> = {
  ga4: false,
  plausible: true,
};

export type ConversionPeriod = {
  from: Date;
  to: Date;
};

export type ConversionGoalTotal = {
  count: number;
  currency: string | null;
  displayName: string;
  revenueMinor: string | null;
};

export type ConversionSourceTotal = {
  goals: ConversionGoalTotal[];
  source: ConversionSource;
  totalCount: number;
};

export type ConversionPageTotal = {
  goals: ConversionGoalTotal[];
  path: string;
  totalCount: number;
};

export type ConversionSeriesPoint = {
  date: string;
  goals: ConversionGoalTotal[];
  totalCount: number;
};

export type ConversionSourceState = {
  connected: boolean;
  conversions28: number;
  label: string;
  lastDay: string | null;
  logoDomain: string | null;
  primary: boolean;
  reportsRevenue: boolean;
  source: ConversionSource;
};

export type ComparisonCell = {
  count: number | null;
  currency: string | null;
  revenueMinor: string | null;
  source: ConversionSource;
};

export type ComparisonRow = {
  cells: ComparisonCell[];
  displayName: string;
};

export type SettingsConversionGoal = {
  countsRevenue: boolean;
  displayName: string;
  enabled: boolean;
  id: string;
  last28: number;
  reportsRevenue: boolean;
  source: ConversionSource;
  sourceLabel: string;
  sourceName: string;
};

export type ConversionsSettingsModel = {
  comparison: ComparisonRow[];
  goals: SettingsConversionGoal[];
  primary: ConversionSource | null;
  showComparison: boolean;
  sources: ConversionSourceState[];
};

export type ConversionActionResult =
  | { ok: true; unchanged?: boolean }
  | { error: "failed" | "missing" | "not_connected" | "revenue"; ok: false };

export function isConversionSource(value: string | null | undefined): value is ConversionSource {
  return typeof value === "string" && CONVERSION_SOURCE_SET.has(value);
}

export function conversionSourceReportsRevenue(source: ConversionSource) {
  return REPORTS_REVENUE[source];
}

/** Catalog key plus source ids. The annotations module translates this at render time. */
export function primaryConversionSignalPayload(
  from: ConversionSource | null,
  to: ConversionSource,
) {
  return {
    from: from ?? "none",
    generated: "primaryConversion" as const,
    to,
  };
}
