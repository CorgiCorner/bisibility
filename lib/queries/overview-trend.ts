import { resolveRecordedChecks } from "@/lib/rank-measurements/check-resolution";
import type { CapturedObservation } from "@/lib/rank-measurements/recorded-check";
import type { MeasurementPolicy } from "@/lib/rank-measurements/types";

export type Check = {
  checkedAt: Date;
  normalizationVersion: string | null;
  observationRun?: CapturedObservation | null;
  id?: string;
  provider?: string;
  position: number | null;
  previousPosition: number | null;
  rankingUrl: string | null;
  requestedDepth: number | null;
  status: string;
};
export type Keyword = {
  measurementPolicy?: Partial<MeasurementPolicy>;
  projectId?: string;
  _count: { rankChecks: number };
  createdAt: Date;
  device: string;
  id: string;
  locationRef: {
    countryCode?: string | null;
    displayName: string;
    languageCode?: string | null;
    languageLabel: string;
  };
  publicId: string;
  rankChecks: Check[];
  schedule: { frequency: string; nextCheckAt: Date | null } | null;
  text: string;
};
export type Trend = {
  comparisonKey?: string | null;
  dateKey?: string;
  label: string | null;
  value: number | null;
};
export type TrendTakeaway = {
  days: number;
  kind: "improved" | "slipped" | "steady";
  leader?: string;
  value?: number;
  comparableCount?: number;
  window: "firstTrackedDays" | "lastThirtyDays";
} | null;
const DAY_MS = 24 * 60 * 60 * 1000;
function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function dayEnd(key: string) {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + DAY_MS - 1);
}

export function buildTrend(keywords: readonly Keyword[], start?: Date): Trend[] {
  const days = [
    ...new Set(
      keywords.flatMap((keyword) =>
        keyword.rankChecks
          .filter((check) => !start || check.checkedAt >= start)
          .map((check) => check.checkedAt.toISOString().slice(0, 10)),
      ),
    ),
  ].sort();
  return days.map((dateKey) => {
    const begin = new Date(`${dateKey}T00:00:00.000Z`),
      asOf = dayEnd(dateKey);
    const entries = keywords
      .map((keyword) => ({
        id: keyword.id,
        quality: resolveRecordedChecks(
          keyword.rankChecks,
          keyword.id,
          {
            asOf,
            currentNotBefore: begin,
            requestedGeo: {
              location: keyword.locationRef.displayName,
              device: keyword.device,
              ...(keyword.locationRef.languageCode
                ? { language: keyword.locationRef.languageCode }
                : {}),
            },
          },
          keyword.projectId,
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const measured = entries.filter(
      ({ quality }) =>
        quality.latestAttempt?.execution === "completed" &&
        quality.current?.evidence === "positive",
    );
    const keys = measured.map(({ id, quality }) => [id, quality.current?.comparisonKey]);
    return {
      comparisonKey:
        keys.length && keys.every(([, key]) => key !== null) ? JSON.stringify(keys) : null,
      dateKey,
      label: dateKey,
      value: measured.length
        ? Math.round(average(measured.map(({ quality }) => quality.current?.position ?? 0)) * 10) /
          10
        : null,
    };
  });
}

/** A narrative uses positive pairs from one cohort, never three unrelated daily averages. */
export function buildTrendTakeaway(
  keywords: readonly Keyword[],
  now: Date,
  volumes: ReadonlyMap<string, number | null> = new Map(),
): TrendTakeaway {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 29 * DAY_MS,
  );
  const dates = keywords.flatMap((keyword) =>
    keyword.rankChecks
      .filter((check) => check.checkedAt >= windowStart && check.checkedAt <= now)
      .map((check) => check.checkedAt.getTime()),
  );
  if (!dates.length) return null;
  const first = new Date(dates.reduce((a, b) => Math.min(a, b))),
    last = new Date(dates.reduce((a, b) => Math.max(a, b)));
  const days = Math.floor((last.getTime() - first.getTime()) / DAY_MS) + 1;
  if (days < 7) return null;
  const baselineBefore = dayEnd(first.toISOString().slice(0, 10));
  const pairs = keywords.flatMap((keyword) => {
    const quality = resolveRecordedChecks(
      keyword.rankChecks,
      keyword.id,
      {
        asOf: now,
        currentNotBefore: windowStart,
        baselineBefore,
        baselineNotBefore: windowStart,
        requestedGeo: {
          location: keyword.locationRef.displayName,
          device: keyword.device,
          ...(keyword.locationRef.languageCode
            ? { language: keyword.locationRef.languageCode }
            : {}),
        },
      },
      keyword.projectId,
    );
    return quality.movement !== null
      ? [{ keyword, movement: quality.movement, volume: volumes.get(keyword.id) ?? 0 }]
      : [];
  });
  if (!pairs.length) return null;
  const signedDelta = average(pairs.map((pair) => pair.movement));
  const value = Math.round(Math.abs(signedDelta) * 10) / 10;
  const short = days < 30;
  const leader = pairs.sort(
    (a, b) =>
      (signedDelta >= 0 ? b.movement - a.movement : a.movement - b.movement) ||
      b.volume - a.volume ||
      a.keyword.text.localeCompare(b.keyword.text),
  )[0]?.keyword.text;
  return {
    days: Math.min(days, 30),
    kind: value < 0.1 ? "steady" : signedDelta > 0 ? "improved" : "slipped",
    ...(value >= 0.1 ? { value, ...(!short ? { leader } : {}) } : {}),
    comparableCount: pairs.length,
    window: short ? "firstTrackedDays" : "lastThirtyDays",
  };
}
