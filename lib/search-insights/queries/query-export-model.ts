import type { DateWindow } from "@/lib/search-insights/dates";
import { propertyDisplayName } from "./context-model";

export type QueryExportInput = {
  clicks: bigint | number;
  impressions: bigint | number;
  positionWeight: number;
  query: string;
};

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * CTR is the window's clicks over its impressions, and position is impression-weighted:
 * averaging the daily averages would let a day with three impressions outvote a day with
 * thirty thousand.
 */
export function queryExportRows(rows: readonly QueryExportInput[]) {
  return rows.map((row) => {
    const clicks = Number(row.clicks);
    const impressions = Number(row.impressions);
    return [
      row.query,
      clicks,
      impressions,
      ratio(clicks, impressions).toFixed(4),
      ratio(row.positionWeight, impressions).toFixed(2),
    ] as const;
  });
}

function propertySlug(property: string) {
  return (
    propertyDisplayName(property)
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "property"
  );
}

export function exportFilename(property: string, window: DateWindow | null) {
  const range = window ? `${window.start}-${window.end}` : "no-window";
  return `search-insights-queries-${propertySlug(property)}-${range}.csv`;
}
