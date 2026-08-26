import { applyKeywordFilters, matchesKeywordSearch } from "@/lib/keywords/keyword-filter-model";
import type {
  RankTrackerQueryState,
  RankTrackerSortField,
} from "@/lib/keywords/rank-tracker-query-types";
import type { KeywordRow } from "./keyword-row-types";

const text = (value: unknown) => String(value ?? "").toLowerCase();
const number = (value: unknown) => (typeof value === "number" ? value : null);
const values: Record<RankTrackerSortField, (row: KeywordRow) => unknown> = {
  keyword: (row) => text(row.keyword),
  device: (row) => text(row.device),
  position: (row) => row.position,
  change: (row) => (row.positionBaseline === null ? null : row.positionBaseline - row.position),
  volume: (row) => row.volume,
  difficulty: (row) => row.difficulty,
  sparkline: (row) => row.position,
  clicks: (row) => row.clicks,
  impressions: (row) => row.impressions,
  ctr: (row) => row.ctr,
  lastChecked: (row) => row.lastCheckAt,
  frequency: (row) => row.schedule.frequency,
  location: (row) => text(row.location.displayName),
  targetRanking: (row) => text([row.targetUrl, row.rankingUrl].filter(Boolean).join(" ")),
  tags: (row) => row.tags.join(" "),
  topic: (row) => text(row.topic),
  intent: (row) => text(row.intent),
};

function compareValue(left: unknown, right: unknown, direction: "asc" | "desc") {
  if (left == null) return right == null ? 0 : direction === "asc" ? -1 : 1;
  if (right == null) return direction === "asc" ? 1 : -1;
  const numericLeft = number(left);
  const numericRight = number(right);
  const compared =
    numericLeft !== null && numericRight !== null
      ? numericLeft - numericRight
      : String(left).localeCompare(String(right));
  return direction === "asc" ? compared : -compared;
}

export function filterExactRankTrackerRows(rows: KeywordRow[], query: RankTrackerQueryState) {
  return applyKeywordFilters(rows, query.filters).filter((row) =>
    matchesKeywordSearch(row, query.search),
  );
}

export function exactRankTrackerRows(rows: KeywordRow[], query: RankTrackerQueryState) {
  const order = new Map(rows.map((row, index) => [row.id, index]));
  return filterExactRankTrackerRows(rows, query).sort(
    (left, right) =>
      compareValue(
        values[query.sort.field](left),
        values[query.sort.field](right),
        query.sort.direction,
      ) || (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  );
}
