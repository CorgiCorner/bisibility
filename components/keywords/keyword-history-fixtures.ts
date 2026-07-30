import { positionDateLabel } from "@/lib/keywords/position-history";

export function buildPositionHistory(sparkline: readonly number[]) {
  const latest = new Date();
  latest.setHours(10, 0, 0, 0);
  return sparkline.map((position, index) => {
    const checkedAt = new Date(latest);
    checkedAt.setDate(latest.getDate() - (sparkline.length - index - 1) * 7);
    return {
      checkedAt: checkedAt.toISOString(),
      label: positionDateLabel(checkedAt),
      position,
    };
  });
}
