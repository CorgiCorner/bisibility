import type { SummaryStripTone } from "@/components/ui/SummaryStrip";
import { weeklyPositionComparison } from "@/lib/keywords/position-history";
import type { KeywordRow } from "@/lib/queries/keywords";

export type KeywordWeeklySummary = {
  kind: "dropped" | "improved" | "mixed" | "steady";
  improved?: number;
  keyword?: string;
  positionDelta?: number;
  total?: number;
  tone: SummaryStripTone;
};

function higherClicksThenAlphabetical(left: KeywordRow, right: KeywordRow) {
  return (right.clicks ?? 0) - (left.clicks ?? 0) || left.keyword.localeCompare(right.keyword);
}

export function buildKeywordWeeklySummary(
  rows: readonly KeywordRow[],
): KeywordWeeklySummary | null {
  const comparisons = rows.flatMap((row) => {
    const comparison = weeklyPositionComparison(row.positionHistory);
    return comparison ? [{ ...comparison, row }] : [];
  });
  if (comparisons.length === 0) return null;

  const improved = comparisons.filter(({ delta }) => delta >= 1);
  const dropped = comparisons.filter(({ delta }) => delta <= -1);
  const biggestDrop = [...dropped].sort(
    (left, right) => left.delta - right.delta || higherClicksThenAlphabetical(left.row, right.row),
  )[0];

  if (improved.length === 0 && !biggestDrop) {
    return { kind: "steady", tone: "steady" };
  }
  if (!biggestDrop) {
    return {
      improved: improved.length,
      kind: "improved",
      tone: "improved",
      total: rows.length,
    };
  }
  if (improved.length === 0) {
    return {
      kind: "dropped",
      keyword: biggestDrop.row.keyword,
      positionDelta: biggestDrop.delta,
      tone: "dropped",
    };
  }
  return {
    improved: improved.length,
    kind: "mixed",
    keyword: biggestDrop.row.keyword,
    positionDelta: biggestDrop.delta,
    tone: "improved",
    total: rows.length,
  };
}
