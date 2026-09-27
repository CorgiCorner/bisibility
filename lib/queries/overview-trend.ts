import { positionComparisonKey } from "@/lib/checks/position-observations";
import { comparableCompletedWindow } from "@/lib/checks/status";

export type Check = {
  checkedAt: Date;
  normalizationVersion: string | null;
  position: number | null;
  previousPosition: number | null;
  rankingUrl: string | null;
  requestedDepth: number | null;
  status: string;
};
export type Keyword = {
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
  window: "firstTrackedDays" | "lastThirtyDays";
} | null;

const DAY_MS = 24 * 60 * 60 * 1000;

function position(value: number | null | undefined) {
  return typeof value === "number" && value > 0 && value <= 100 ? value : null;
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dailyAverages(keywords: readonly Keyword[], start?: Date) {
  const groups = new Map<string, { date: Date; positions: number[] }>();
  for (const keyword of keywords) {
    for (const check of comparableCompletedWindow(keyword.rankChecks).checks) {
      const current = position(check.position);
      if (!current || check.status !== "completed" || (start && check.checkedAt < start)) continue;
      const key = check.checkedAt.toISOString().slice(0, 10);
      const group = groups.get(key) ?? {
        date: new Date(`${key}T00:00:00.000Z`),
        positions: [],
      };
      group.positions.push(current);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .map(({ date, positions }) => ({ date, value: average(positions) }));
}

export function buildTrend(keywords: readonly Keyword[], start?: Date): Trend[] {
  const days = new Map<string, Map<string, Check>>();
  for (const keyword of keywords) {
    for (const check of keyword.rankChecks) {
      if (check.status !== "completed" || (start && check.checkedAt < start)) continue;
      if (check.position !== null && position(check.position) === null) continue;
      const day = check.checkedAt.toISOString().slice(0, 10);
      const observations = days.get(day) ?? new Map<string, Check>();
      const previous = observations.get(keyword.id);
      if (!previous || check.checkedAt > previous.checkedAt) observations.set(keyword.id, check);
      days.set(day, observations);
    }
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([dateKey, observations], index, points) => {
      const entries = [...observations.entries()].sort(([a], [b]) => a.localeCompare(b));
      const positions = entries.flatMap(([, check]) => {
        const value = position(check.position);
        return value === null ? [] : [value];
      });
      const keys = entries.map(([id, check]) => [id, positionComparisonKey(check)]);
      return {
        comparisonKey: keys.some(([, key]) => key === null) ? null : JSON.stringify(keys),
        dateKey,
        label: index === points.length - 1 ? null : dateKey,
        value: positions.length ? Math.round(average(positions) * 10) / 10 : null,
      };
    });
}

function trackedDays(first: Date, last: Date) {
  return Math.floor((last.getTime() - first.getTime()) / DAY_MS) + 1;
}

function leadKeyword(
  keywords: readonly Keyword[],
  start: Date,
  improving: boolean,
  volumes: ReadonlyMap<string, number | null>,
) {
  return keywords
    .flatMap((keyword) => {
      const checks = comparableCompletedWindow(keyword.rankChecks)
        .checks.filter(
          (check) =>
            check.status === "completed" && check.checkedAt >= start && position(check.position),
        )
        .sort((left, right) => left.checkedAt.getTime() - right.checkedAt.getTime());
      const first = position(checks[0]?.position);
      const latest = position(checks.at(-1)?.position);
      return first && latest
        ? [{ keyword, movement: first - latest, volume: volumes.get(keyword.id) ?? 0 }]
        : [];
    })
    .sort((left, right) => {
      const movement = improving ? right.movement - left.movement : left.movement - right.movement;
      return (
        movement ||
        right.volume - left.volume ||
        left.keyword.text.localeCompare(right.keyword.text)
      );
    })[0]?.keyword.text;
}

export function buildTrendTakeaway(
  keywords: readonly Keyword[],
  now: Date,
  volumes: ReadonlyMap<string, number | null> = new Map(),
): TrendTakeaway {
  const windowDays = 30;
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (windowDays - 1) * DAY_MS,
  );
  const points = dailyAverages(keywords, windowStart);
  if (points.length === 0) return null;
  const days = trackedDays(points[0]?.date ?? now, points.at(-1)?.date ?? now);
  if (days < 7) return null;

  const startAverage = average(points.slice(0, 3).map((point) => point.value));
  const endAverage = average(points.slice(-3).map((point) => point.value));
  const signedDelta = startAverage - endAverage;
  const delta = Math.round(Math.abs(signedDelta) * 10) / 10;
  const shortHistory = days < windowDays;

  if (delta < 0.1) {
    return {
      days: shortHistory ? days : windowDays,
      kind: "steady",
      window: shortHistory ? "firstTrackedDays" : "lastThirtyDays",
    };
  }

  if (shortHistory) {
    return {
      days,
      kind: signedDelta > 0 ? "improved" : "slipped",
      value: delta,
      window: "firstTrackedDays",
    };
  }
  const leader =
    leadKeyword(keywords, windowStart, signedDelta > 0, volumes) ??
    keywords.map((keyword) => keyword.text).sort()[0] ??
    "";
  return {
    days: windowDays,
    kind: signedDelta > 0 ? "improved" : "slipped",
    leader,
    value: delta,
    window: "lastThirtyDays",
  };
}
