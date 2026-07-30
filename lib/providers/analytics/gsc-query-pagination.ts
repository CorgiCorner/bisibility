import type {
  AnalyticsMetricRange,
  AnalyticsQueryStatsInput,
  ProviderCredentials,
  QueryStatRow,
} from "@/lib/providers/types";

export const GSC_QUERY_STATS_PAGE_SIZE = 25_000;
export const GSC_QUERY_STATS_ROW_CAP = GSC_QUERY_STATS_PAGE_SIZE * 3;

type QueryPageInput = AnalyticsQueryStatsInput & {
  credentials: ProviderCredentials;
  dimensions: string[];
  rowLimit: number;
  startRow?: number;
};

function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function gscQueryDimensions(input: AnalyticsQueryStatsInput) {
  return input.pagePath ? ["query", "page"] : ["query"];
}

export function gscDimensionFilterGroups(input: AnalyticsQueryStatsInput) {
  const filters: Array<{ dimension: string; expression: string; operator: string }> = [];
  if (input.query) {
    filters.push({ dimension: "query", expression: input.query, operator: "equals" });
  }
  if (input.pagePath) {
    const isPrefix = input.pagePath.match === "prefix";
    const value = isPrefix ? input.pagePath.value.replace(/\*$/, "") : input.pagePath.value;
    filters.push({
      dimension: "page",
      expression: isPrefix ? `^https?://[^/]+${escapedRegex(value)}` : value,
      operator: isPrefix ? "includingRegex" : "contains",
    });
  }
  return filters.length > 0 ? { dimensionFilterGroups: [{ filters }] } : {};
}

function withinRange(value: number, range?: AnalyticsMetricRange) {
  return (
    (range?.min === undefined || value >= range.min) &&
    (range?.max === undefined || value <= range.max)
  );
}

export function filterGscQueryStats(rows: QueryStatRow[], input: AnalyticsQueryStatsInput) {
  return rows.filter(
    (row) =>
      withinRange(row.clicks, input.clicks) &&
      withinRange(row.impressions, input.impressions) &&
      withinRange(row.position, input.position),
  );
}

export async function fetchGscQueryStats<Row>(
  credentials: ProviderCredentials,
  input: AnalyticsQueryStatsInput,
  fetchPage: (input: QueryPageInput) => Promise<Row[]>,
): Promise<Row[]> {
  const dimensions = gscQueryDimensions(input);
  if (input.limit !== undefined || (input.query && !input.pagePath)) {
    return fetchPage({
      ...input,
      credentials,
      dimensions,
      rowLimit: input.limit ?? 1,
    });
  }

  const rows: Row[] = [];
  while (rows.length < GSC_QUERY_STATS_ROW_CAP) {
    const page = await fetchPage({
      ...input,
      credentials,
      dimensions,
      rowLimit: GSC_QUERY_STATS_PAGE_SIZE,
      startRow: rows.length,
    });
    rows.push(...page);
    if (page.length < GSC_QUERY_STATS_PAGE_SIZE) break;
  }
  return rows;
}
