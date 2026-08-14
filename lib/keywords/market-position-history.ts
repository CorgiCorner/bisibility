import type { KeywordRow, PositionPoint } from "@/lib/queries/keywords";
import { calendarDayKey, dailyPositionPoints } from "./position-history";

export function keywordMarketLabel(keyword: Pick<KeywordRow, "location">) {
  return `${keyword.location.displayName} / ${keyword.location.languageLabel ?? keyword.location.hl}`;
}

export function comparisonTargets(targets: readonly KeywordRow[], active: KeywordRow) {
  const sameDevice = targets.filter(
    (target) => target.device.toLowerCase() === active.device.toLowerCase(),
  );
  return [...new Map(sameDevice.map((target) => [target.location.canonicalKey, target])).values()];
}

export function marketComparisonData(targets: readonly KeywordRow[], days: number) {
  const histories = targets.map((target) => ({
    points: dailyPositionPoints(target.positionHistory, days),
    target,
  }));
  const labels = [
    ...new Map(
      histories
        .flatMap(({ points }) => points)
        .sort(
          (left, right) => new Date(left.checkedAt).getTime() - new Date(right.checkedAt).getTime(),
        )
        .map((point) => [calendarDayKey(new Date(point.checkedAt)), point.label]),
    ).values(),
  ];
  const values = histories.flatMap(({ points, target }) => {
    const byDay = new Map(
      points.map((point) => [calendarDayKey(new Date(point.checkedAt)), point.position]),
    );
    return [
      {
        data: labels.map((label) => {
          const point = points.find((candidate) => candidate.label === label);
          return point ? (byDay.get(calendarDayKey(new Date(point.checkedAt))) ?? null) : null;
        }),
        points: points.map((point): PositionPoint => ({ ...point, label: point.label })),
        target,
      },
    ];
  });
  return { labels, values };
}

export function comparisonAriaLabel(targets: readonly KeywordRow[]) {
  const markets = targets.map((target) => {
    const position = target.hasRankData ? `#${target.position}` : "position unavailable";
    return `${keywordMarketLabel(target)} ${position}`;
  });
  return `All-market position history: ${markets.join(", ")}.`;
}
