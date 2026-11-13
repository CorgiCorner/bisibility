export const pageVitalsStrategies = ["mobile", "desktop"] as const;
export const pageVitalsSources = ["field", "origin", "lab"] as const;
export const pageVitalsStatuses = ["good", "needs_improvement", "poor", "unknown"] as const;

export type PageVitalsStrategy = (typeof pageVitalsStrategies)[number];
export type PageVitalsSource = (typeof pageVitalsSources)[number];
export type PageVitalsStatus = (typeof pageVitalsStatuses)[number];

export type PageVitalsMetric = "cls" | "inp" | "lcp";

const THRESHOLDS = {
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  lcp: { good: 2500, poor: 4000 },
} as const;

/** Google's published CrUX bands. The good and poor edges are inclusive on the good side. */
export function metricBand(metric: PageVitalsMetric, value: number): PageVitalsStatus {
  const band = THRESHOLDS[metric];
  if (value <= band.good) return "good";
  if (value <= band.poor) return "needs_improvement";
  return "poor";
}

const RANK: Record<PageVitalsStatus, number> = {
  good: 0,
  needs_improvement: 1,
  poor: 2,
  unknown: -1,
};

/** A page passes when every available metric is good. Missing metrics are not a failure. */
export function pageVitalsStatus(input: {
  cls: number | null;
  inpMs: number | null;
  lcpMs: number | null;
}): PageVitalsStatus {
  const bands = [
    input.lcpMs == null ? null : metricBand("lcp", input.lcpMs),
    input.inpMs == null ? null : metricBand("inp", input.inpMs),
    input.cls == null ? null : metricBand("cls", input.cls),
  ].filter((band): band is PageVitalsStatus => band != null);
  if (bands.length === 0) return "unknown";
  return bands.reduce((worst, band) => (RANK[band] > RANK[worst] ? band : worst));
}
