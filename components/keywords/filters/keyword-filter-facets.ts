import { type PositionBucketId, positionBuckets } from "@/lib/keywords/keyword-filter-model";
import type { KeywordRow } from "@/lib/queries/keywords";

type FacetValue = { count: number; label: string };

const defaultTags = ["High intent", "Product", "Docs", "Comparison", "Blog", "Infra", "Brand"];

function inPositionBucket(position: number, bucket: PositionBucketId) {
  if (bucket === "top3") return position <= 3;
  if (bucket === "top10") return position <= 10;
  if (bucket === "11-50") return position > 10 && position <= 50;
  return position > 50 && position <= 100;
}

function countedValues(rows: KeywordRow[], values: readonly string[]) {
  return values.map((label) => ({
    count: rows.filter((row) => row.tags.includes(label)).length,
    label,
  }));
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
  const tagSet = new Set(defaultTags);
  for (const row of rows) {
    for (const tag of row.tags) tagSet.add(tag);
  }
  return {
    intents: metadataCounts(rows, "intent"),
    positions: positionBuckets.map((bucket) => ({
      ...bucket,
      count: rows.filter((row) => inPositionBucket(row.position, bucket.id)).length,
    })),
    tags: countedValues(rows, [...tagSet]),
    topics: metadataCounts(rows, "topic"),
  };
}
