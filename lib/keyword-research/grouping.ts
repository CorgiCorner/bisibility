import type { KeywordResearchRow } from "./types";

export type GroupedResearchRow = KeywordResearchRow & {
  variants: KeywordResearchRow[];
};

export function normalizeResearchVariant(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function volume(row: KeywordResearchRow) {
  return row.searchVolume ?? -1;
}

export function groupResearchRows(rows: readonly KeywordResearchRow[]): GroupedResearchRow[] {
  const groups = new Map<string, KeywordResearchRow[]>();
  for (const row of rows) {
    const key = normalizeResearchVariant(row.keyword);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()]
    .map((variants) => {
      const sorted = [...variants].sort(
        (left, right) => volume(right) - volume(left) || left.keyword.localeCompare(right.keyword),
      );
      const representative = sorted[0];
      if (!representative) {
        throw new Error("Keyword research group cannot be empty.");
      }
      return { ...representative, variants: sorted };
    })
    .sort(
      (left, right) => volume(right) - volume(left) || left.keyword.localeCompare(right.keyword),
    );
}
