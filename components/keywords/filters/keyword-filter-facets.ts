import { type PositionBucketId, positionBuckets } from "@/lib/keywords/keyword-filter-model";
import type { KeywordRow } from "@/lib/queries/keywords";

type FacetValue = { count: number; label: string };

function inPositionBucket(position: number, bucket: PositionBucketId) {
  if (bucket === "top3") return position <= 3;
  if (bucket === "top10") return position <= 10;
  if (bucket === "11-50") return position > 10 && position <= 50;
  return position > 50 && position <= 100;
}

function tagCounts(rows: KeywordRow[]): FacetValue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const rowTags = new Set(row.tags.map((tag) => tag.trim()).filter(Boolean));
    for (const tag of rowTags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ count, label }));
}

function metadataCounts(rows: KeywordRow[], field: "intent" | "topic"): FacetValue[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[field]?.trim();
    if (value) values.add(value);
  }
  return [...values].map((label) => ({
    count: rows.filter((row) => row[field] === label).length,
    label,
  }));
}

export function getFilterFacets(rows: KeywordRow[]) {
  return {
    intents: metadataCounts(rows, "intent"),
    positions: positionBuckets.map((bucket) => ({
      ...bucket,
      count: rows.filter((row) => inPositionBucket(row.position, bucket.id)).length,
    })),
    tags: tagCounts(rows),
    topics: metadataCounts(rows, "topic"),
  };
}
