type PositionCheck = {
  checkedAt: Date;
  position: number | null;
};

type DatedPositionPoint = {
  checkedAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const POSITION_DIRECTION_CUE = "CLOSER TO #1 = BETTER";

export function positionTargetAnnotation(position: number, target: number) {
  const distance = position - target;
  return distance > 0
    ? `#${position} today, ${distance} away from target`
    : `#${position} today, target reached`;
}

export function positionHistoryAriaLabel(
  keyword: string,
  position: number | undefined,
  target: number | null,
) {
  if (position === undefined || target === null) return `Position history for ${keyword}.`;
  const distance = position - target;
  return distance > 0
    ? `Position history for ${keyword}. Currently #${position}, target #${target}, ${distance} away from target.`
    : `Position history for ${keyword}. Currently #${position}, target #${target}, target reached.`;
}

export function calendarDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function positionDateLabel(date: Date, now = new Date()) {
  return calendarDayKey(date) === calendarDayKey(now)
    ? "Today"
    : date.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function earlierDayPosition(
  checksNewestFirst: readonly PositionCheck[],
  latestCheck: PositionCheck | undefined,
) {
  if (!latestCheck) return null;
  const latestDay = calendarDayKey(latestCheck.checkedAt);
  const baseline = checksNewestFirst.find(
    (check) =>
      check.position !== null &&
      check.position > 0 &&
      calendarDayKey(check.checkedAt) !== latestDay,
  );
  return baseline?.position ?? null;
}

export function dailyPositionPoints<T extends DatedPositionPoint>(
  points: readonly T[],
  days: number,
  now = new Date(),
) {
  const cutoff =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    (Math.max(days, 1) - 1) * DAY_MS;
  const latestByDay = new Map<string, { point: T; timestamp: number }>();

  for (const point of points) {
    const checkedAt = new Date(point.checkedAt);
    const timestamp = checkedAt.getTime();
    if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;
    const day = calendarDayKey(checkedAt);
    const current = latestByDay.get(day);
    if (!current || timestamp > current.timestamp) {
      latestByDay.set(day, { point, timestamp });
    }
  }

  return [...latestByDay.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .map(({ point }) => point);
}

export function weeklyPositionComparison<T extends DatedPositionPoint & { position: number }>(
  points: readonly T[],
) {
  const dated = points
    .map((point) => ({ point, timestamp: new Date(point.checkedAt).getTime() }))
    .filter(({ point, timestamp }) => Number.isFinite(timestamp) && point.position > 0)
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = dated.at(-1);
  if (!latest) return null;
  const baseline = dated
    .filter(({ timestamp }) => timestamp <= latest.timestamp - 7 * DAY_MS)
    .at(-1);
  if (!baseline) return null;
  return {
    current: latest.point.position,
    delta: baseline.point.position - latest.point.position,
    previous: baseline.point.position,
  };
}
