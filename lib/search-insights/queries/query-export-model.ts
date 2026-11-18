import type { DateWindow } from "@/lib/search-insights/dates";
import { datedCsvFilename } from "@/lib/ui/export-filename";
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

export function exportFilename(property: string, window: DateWindow | null) {
  return datedCsvFilename(
    "search-insights-queries",
    propertyDisplayName(property) || "property",
    window,
  );
}
