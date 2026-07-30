import type { SummaryStripTone } from "@/components/ui";
import { weeklyPositionComparison } from "@/lib/keywords/position-history";
import type { KeywordRow } from "@/lib/queries/keywords";

export type KeywordWeeklySummary = {
  sentence: string;
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
    return { sentence: "Positions held steady this week", tone: "steady" };
  }
  if (!biggestDrop) {
    return {
      sentence: `${improved.length} of ${rows.length} keywords improved this week · no drops`,
      tone: "improved",
    };
  }
  const dropCopy = `biggest drop: ${biggestDrop.row.keyword} (${biggestDrop.delta})`;
  if (improved.length === 0) {
    return {
      sentence: `No keywords improved this week · ${dropCopy}`,
      tone: "dropped",
    };
  }
  return {
    sentence: `${improved.length} of ${rows.length} keywords improved this week · ${dropCopy}`,
    tone: "improved",
  };
}
