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

const QUERY_DIMENSION_ORDER = ["query", "page", "country", "device"] as const;

export function gscQueryDimensions(input: AnalyticsQueryStatsInput) {
  const requested = input.dimensions?.length
    ? input.dimensions
    : input.pagePath
      ? ["query", "page"]
      : ["query"];
  const selected = new Set<string>(requested);
  if (input.pagePath) selected.add("page");
  return QUERY_DIMENSION_ORDER.filter((dimension) => selected.has(dimension));
}

type QueryFilterInput = Pick<
  AnalyticsQueryStatsInput,
  "country" | "device" | "endDate" | "pagePath" | "query" | "queryMatch" | "startDate"
>;

export function gscDimensionFilterGroups(input: QueryFilterInput) {
  const filters: Array<{ dimension: string; expression: string; operator: string }> = [];
  if (input.query) {
    filters.push({
      dimension: "query",
      expression: input.query,
      operator: input.queryMatch === "contains" ? "contains" : "equals",
    });
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
  if (input.country) {
    filters.push({
      dimension: "country",
      expression: input.country.toLowerCase(),
      operator: "equals",
    });
  }
  // Search Analytics matches the device dimension with an uppercase token.
  if (input.device) {
    filters.push({
      dimension: "device",
      expression: input.device.toUpperCase(),
      operator: "equals",
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
      ...(input.offset === undefined ? {} : { startRow: input.offset }),
    });
  }

  const rows: Row[] = [];
  while (rows.length < GSC_QUERY_STATS_ROW_CAP) {
    const page = await fetchPage({
      ...input,
      credentials,
      dimensions,
      rowLimit: GSC_QUERY_STATS_PAGE_SIZE,
      startRow: (input.offset ?? 0) + rows.length,
    });
    rows.push(...page);
    if (page.length < GSC_QUERY_STATS_PAGE_SIZE) break;
  }
  return rows;
}
