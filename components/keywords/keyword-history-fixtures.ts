import { positionDateLabel } from "@/lib/keywords/position-history";

export function buildPositionHistory(sparkline: readonly number[]) {
  // Anchor on the UTC calendar day so the fixture is identical on every machine: local
  // setters shift the points by a day when the clock sits past 22:00 UTC in a UTC+2 zone.
  const latest = new Date();
  latest.setUTCHours(10, 0, 0, 0);
  return sparkline.map((position, index) => {
    const checkedAt = new Date(latest);
    checkedAt.setUTCDate(latest.getUTCDate() - (sparkline.length - index - 1) * 7);
    return {
      checkedAt: checkedAt.toISOString(),
      label: positionDateLabel(checkedAt),
      position,
    };
  });
}
