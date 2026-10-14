import type {
  RankTrackerQueryState,
  RankTrackerSortField,
} from "@/lib/keywords/rank-tracker-query-types";
import type { RankTrackerQualityRow } from "./rank-tracker-report-model";

const lower = (value: string | null) => value?.toLocaleLowerCase("en-US") ?? null;
const values: Record<RankTrackerSortField, (row: RankTrackerQualityRow) => string | number | null> =
  {
    keyword: (row) => lower(row.keyword),
    device: (row) => lower(row.device),
    position: (row) =>
      row.rankQuality.current?.evidence === "positive" ? row.rankQuality.current.position : null,
    change: (row) => row.rankQuality.movement,
    volume: (row) => (row.volumeKnown === false ? null : row.volume),
    difficulty: (row) => (row.difficultyKnown === false ? null : row.difficulty),
    sparkline: (row) =>
      row.rankQuality.current?.evidence === "positive" ? row.rankQuality.current.position : null,
    clicks: (row) => row.clicks,
    impressions: (row) => row.impressions,
    ctr: (row) => row.ctr,
    lastChecked: (row) => row.rankQuality.latestAttempt?.recordedAt ?? null,
    frequency: (row) => row.schedule.frequency,
    location: (row) => lower(row.location.displayName),
    targetRanking: (row) => {
      const captured = [row.expectedUrl, row.rankingUrl].filter(Boolean).join(" ");
      return captured ? lower(captured) : null;
    },
    tags: (row) => row.tags.join(" "),
    topic: (row) => lower(row.topic),
    intent: (row) => lower(row.intent),
  };
export function compareRankTrackerQualityValue(
  left: string | number | null,
  right: string | number | null,
  direction: "asc" | "desc",
) {
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
  const compared =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "en-US");
  return direction === "asc" ? compared : -compared;
}
export function sortRankTrackerQualityRows(
  rows: readonly RankTrackerQualityRow[],
  sort: RankTrackerQueryState["sort"],
) {
  return [...rows].sort(
    (a, b) =>
      compareRankTrackerQualityValue(
        values[sort.field](a),
        values[sort.field](b),
        sort.direction,
      ) || a.id.localeCompare(b.id, "en-US"),
  );
}
