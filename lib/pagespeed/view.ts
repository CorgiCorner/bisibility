import { pageVitalsStatus } from "./thresholds";

export const pageVitalsStrategies = ["mobile", "desktop"] as const;
export const pageVitalsSources = ["field", "origin", "lab"] as const;
export const pageVitalsStatuses = ["good", "needs_improvement", "poor", "unknown"] as const;

export type PageVitalsStrategy = (typeof pageVitalsStrategies)[number];
export type PageVitalsSource = (typeof pageVitalsSources)[number];
export type PageVitalsStatus = (typeof pageVitalsStatuses)[number];

export type CoreWebVitalsReading = {
  cls: number | null;
  inpMs: number | null;
  lcpMs: number | null;
  source: PageVitalsSource | null;
  status: PageVitalsStatus | null;
};

export type CoreWebVitalsRow = CoreWebVitalsReading & { path: string };

export type CoreWebVitalsStrategyView = {
  passCount: number;
  rows: CoreWebVitalsRow[];
};

export type CoreWebVitalsCardModel = {
  connected: boolean;
  desktop: CoreWebVitalsStrategyView;
  mobile: CoreWebVitalsStrategyView;
};

export type PageVitalsActionCode = "invalid_key" | "no_sample" | "not_connected" | "quota";

export type PageVitalsActionResult =
  | { checked: number; ok: true }
  | { checked: number; code: PageVitalsActionCode; ok: false };

export function strategyView(rows: CoreWebVitalsRow[]): CoreWebVitalsStrategyView {
  const checked = rows.filter((row) => row.status != null);
  return {
    passCount: checked.filter((row) => row.status === "good").length,
    rows,
  };
}

export function readingFromStored(input: {
  cls: { toString(): string } | number | string | null;
  inpMs: number | null;
  lcpMs: number | null;
  source: PageVitalsSource;
  status: PageVitalsStatus;
}): CoreWebVitalsReading {
  const cls = input.cls == null ? null : Number(input.cls);
  return {
    cls: Number.isFinite(cls) ? cls : null,
    inpMs: input.inpMs,
    lcpMs: input.lcpMs,
    source: input.source,
    status: input.status,
  };
}

export function storedStatus(input: {
  cls: number;
  inpMs: number | null;
  lcpMs: number;
}): PageVitalsStatus {
  return pageVitalsStatus({ cls: input.cls, inpMs: input.inpMs, lcpMs: input.lcpMs });
}
