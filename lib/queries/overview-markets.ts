import { aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import { resolveRecordedChecks } from "@/lib/rank-measurements/check-resolution";
import type { CapturedObservation } from "@/lib/rank-measurements/recorded-check";
import { semanticRequestedGeo } from "@/lib/rank-measurements/requested-geo";
import type { MeasurementPolicy } from "@/lib/rank-measurements/types";
import type { OverviewRange } from "./overview-filters";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<OverviewRange, number> = { "7d": 7, "28d": 28, "90d": 90 };
const TREND_POINTS = 8;
type MarketCheck = {
  checkedAt: Date;
  position: number | null;
  status: string;
  id?: string;
  provider?: string;
  normalizationVersion?: string | null;
  requestedDepth?: number | null;
  observationRun?: CapturedObservation | null;
};
export type OverviewMarketKeyword = {
  measurementPolicy?: Partial<MeasurementPolicy>;
  publicId?: string;
  id: string;
  projectId?: string;
  device?: string;
  locationId: string;
  locationRef: {
    countryCode?: string | null;
    displayName: string;
    languageCode?: string | null;
    languageLabel: string;
  };
  rankChecks: MarketCheck[];
  schedule: { frequency: string } | null;
};
export type OverviewMarketRow = {
  countryCode?: string | null;
  deltaPoints: number | null;
  languageCode?: string | null;
  languageLabel: string;
  locationId: string;
  locationLabel: string;
  previousPeriod: { end: string; start: string };
  rangeDays: number;
  researchAvailable: boolean;
  targetCount: number;
  top10Count: number | null;
  top10Share: number | null;
  trend: Array<number | null>;
  qualityReport: ReturnType<typeof aggregateMeasurements>;
};
export type OverviewRegistryMarket = {
  location: {
    countryCode?: string | null;
    displayName: string;
    languageCode?: string | null;
    languageLabel: string;
  };
  locationId: string;
  researchAvailable?: boolean;
};
type BuildOptions = { defaultFrequency?: string | null; now: Date; range: OverviewRange };
function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function currentPeriodStart(now: Date, days: number) {
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
}
export function overviewMarketHistoryStart(now: Date, range: OverviewRange) {
  const days = RANGE_DAYS[range];
  return new Date(currentPeriodStart(now, days).getTime() - days * DAY_MS);
}
function reportFor(
  targets: OverviewMarketKeyword[],
  at: Date,
  start: Date,
  previousStart: Date,
  previousEnd: Date,
) {
  return aggregateMeasurements(
    targets.map((target) => {
      const captured = target.measurementPolicy;
      const currentPolicy = captured?.asOf?.getTime() === at.getTime() ? captured : undefined;
      const resolved = resolveRecordedChecks(
        target.rankChecks.map((check) => ({
          ...check,
          normalizationVersion: check.normalizationVersion ?? null,
          requestedDepth: check.requestedDepth ?? null,
        })),
        target.publicId ?? target.id,
        {
          asOf: at,
          horizon: 10,
          currentNotBefore: start,
          baselineBefore: previousEnd,
          baselineNotBefore: previousStart,
          ...(captured && !currentPolicy ? { baselineEnabled: false } : {}),
          ...currentPolicy,
          requestedGeo: semanticRequestedGeo(currentPolicy ?? {}, {
            location: target.locationRef.displayName,
            ...(target.locationRef.languageCode
              ? { language: target.locationRef.languageCode }
              : {}),
            device: target.device,
          }),
        },
        target.projectId,
      );
      return {
        id: target.publicId ?? target.id,
        current: resolved.current,
        baseline: resolved.baseline,
        latestAttempt: resolved.latestAttempt,
        volume: 1,
      };
    }),
    {
      metricId: "organic_top10_rate",
      definitionVersion: "qualified-v1",
      asOf: at,
      curve: Array.from({ length: 10 }, () => 1),
    },
  );
}
function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
export function buildOverviewMarkets(
  keywords: OverviewMarketKeyword[],
  registryOrOptions: OverviewRegistryMarket[] | BuildOptions,
  maybeOptions?: BuildOptions,
): OverviewMarketRow[] {
  const options = Array.isArray(registryOrOptions) ? maybeOptions : registryOrOptions;
  if (!options) throw new Error("Overview market build options are required.");
  const { now, range } = options;
  const byLocation = new Map<string, OverviewMarketKeyword[]>();
  for (const keyword of keywords) {
    if (!keyword.locationId || !keyword.locationRef) continue;
    const group = byLocation.get(keyword.locationId) ?? [];
    group.push(keyword);
    byLocation.set(keyword.locationId, group);
  }
  const registry = Array.isArray(registryOrOptions)
    ? registryOrOptions
    : [...byLocation.entries()].map(([locationId, targets]) => ({
        location: targets[0].locationRef,
        locationId,
        researchAvailable: true,
      }));
  const days = RANGE_DAYS[range];
  const start = currentPeriodStart(now, days);
  const previousStart = new Date(start.getTime() - days * DAY_MS),
    previousEnd = new Date(start.getTime() - 1);
  return registry.map(({ location, locationId, researchAvailable = true }) => {
    const targets = byLocation.get(locationId) ?? [];
    const qualityReport = reportFor(targets, now, start, previousStart, previousEnd);
    const trend = Array.from({ length: TREND_POINTS }, (_, index) => {
      const at = new Date(
        start.getTime() + ((now.getTime() - start.getTime()) * index) / (TREND_POINTS - 1),
      );
      return reportFor(targets, at, start, previousStart, previousEnd).value;
    });
    return {
      countryCode: location.countryCode ?? null,
      languageCode: location.languageCode ?? null,
      languageLabel: location.languageLabel,
      locationId,
      locationLabel: location.displayName,
      deltaPoints: qualityReport.delta,
      rangeDays: days,
      researchAvailable,
      targetCount: targets.length,
      top10Count: qualityReport.counts.metricEligible
        ? qualityReport.contributions.filter((row) => (row.value ?? 0) > 0).length
        : null,
      top10Share: qualityReport.value,
      trend,
      qualityReport,
      previousPeriod: { end: dateKey(previousEnd), start: dateKey(previousStart) },
    };
  });
}
