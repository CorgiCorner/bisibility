import type { ChartMarker } from "@/lib/annotations/marker-style";
import type { ResolvedConversionSource } from "@/lib/conversions/selection";

export const snapshotMetrics = ["clicks", "sessions", "conversions", "ai_cites"] as const;

export type SnapshotMetricId = (typeof snapshotMetrics)[number];

export const snapshotSpans = ["since", "28"] as const;

export type SnapshotSpan = (typeof snapshotSpans)[number];

export type ActivePageSnapshot = {
  id: string;
  label: string;
  pageCount: number;
  signalPublicId: string | null;
  source: "registry" | "sitemap";
  takenOn: string;
};

export type SnapshotMetricOption = {
  disabledReason: "no_data" | "not_connected" | null;
  id: SnapshotMetricId;
  provider: "ga4" | "plausible" | null;
};

export type SnapshotSeriesPoint = {
  day: string;
  existing: number;
  fresh: number;
  removed: number;
};

export type SnapshotTagMetricRow = {
  existingPages: number;
  existingValue: number;
  freshPages: number;
  freshValue: number;
  name: string;
  share: number;
  tagId: string;
};

export type ExistingVsNewView = {
  conversionSelection?: ResolvedConversionSource;
  markers: ChartMarker[];
  metrics: SnapshotMetricOption[];
  points: SnapshotSeriesPoint[];
  selected: SnapshotMetricId | null;
  sessionsNote: "rolling_28_days" | null;
  summary: {
    existingPages: number;
    existingValue: number;
    freshPages: number;
    freshValue: number;
    removedPages: number;
    removedValue: number;
    snapshotPages: number;
  };
  tags: SnapshotTagMetricRow[];
  window: { from: string; to: string };
};

export type TakePageSnapshotResult =
  | { replaced: boolean; snapshot: ActivePageSnapshot; status: "taken" }
  | { pageCount: number; status: "needs_confirmation"; takenOn: string }
  | { status: "conflict" };
