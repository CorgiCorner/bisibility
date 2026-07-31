import { comparableCompletedWindow } from "@/lib/checks/status";

type DateFormatter = { formatDate(date: Date): string };
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
  publicId: string;
  rankChecks: Check[];
  schedule: { frequency: string; nextCheckAt: Date | null } | null;
  text: string;
};
export type Trend = { label: string; value: number };

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

export function buildTrend(
  keywords: readonly Keyword[],
  dateTime: DateFormatter,
  start?: Date,
): Trend[] {
  const points = dailyAverages(keywords, start).slice(-12);
  return points.map((point, index) => ({
    label: index === points.length - 1 ? "now" : dateTime.formatDate(point.date),
    value: Math.round(point.value * 10) / 10,
  }));
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
) {
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
    return shortHistory
      ? `Avg position held steady over the first ${days} days of tracking`
      : `Avg position held steady over the last ${windowDays} days`;
  }

  const direction = signedDelta > 0 ? "improved" : "slipped";
  if (shortHistory) {
    return `Avg position ${direction} ${delta.toFixed(1)} in the first ${days} days of tracking`;
  }
  const leader =
    leadKeyword(keywords, windowStart, signedDelta > 0, volumes) ??
    keywords.map((keyword) => keyword.text).sort()[0] ??
    "";
  return signedDelta > 0
    ? `Avg position improved ${delta.toFixed(1)} in the last 30 days, led by '${leader}'`
    : `Avg position slipped ${delta.toFixed(1)} in the last 30 days · biggest drop: '${leader}'`;
}
