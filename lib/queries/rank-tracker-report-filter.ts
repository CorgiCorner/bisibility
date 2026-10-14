import { hasUrlMismatch } from "@/lib/alerts/url-mismatch";
import type { KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import type { RankTrackerQualityRow } from "./rank-tracker-report-model";

export function rankTrackerQualityPositionMatches(
  row: RankTrackerQualityRow,
  buckets: KeywordFilters["position"],
) {
  if (!buckets.length) return true;
  const point = row.rankQuality.current;
  if (point?.evidence !== "positive" || point.position === null) return false;
  const position = point.position;
  return buckets.some((bucket) =>
    bucket === "top3"
      ? position <= 3
      : bucket === "top10"
        ? position <= 10
        : bucket === "11-50"
          ? position > 10 && position <= 50
          : position > 50 && position <= 100,
  );
}

function changeMatches(row: RankTrackerQualityRow, change: KeywordFilters["change"]) {
  if (change === "any") return true;
  const quality = row.rankQuality;
  if (change === "up") return quality.movement !== null && quality.movement > 0;
  if (change === "down") return quality.movement !== null && quality.movement < 0;
  if (change === "new")
    return (
      quality.event === "first" || quality.event === "entered" || quality.event === "re_entered"
    );
  return quality.event === "exited";
}

export function rankTrackerQualityRowMatches(
  row: RankTrackerQualityRow,
  query: RankTrackerQueryState,
) {
  const f = query.filters;
  const volume = row.volumeKnown === false ? null : row.volume / 1000;
  const volumeRequested = f.volMin > 0 || f.volMax < 50;
  const latest = row.rankQuality.latestAttempt;
  const search = query.search.trim().toLowerCase();
  const terms = [
    row.keyword,
    row.id,
    row.rankingUrl,
    row.rankingPath,
    row.expectedUrl,
    row.tags.join(" "),
    row.topic,
    row.intent,
  ]
    .join(" ")
    .toLowerCase();
  const features = row.serpFeatures.map((feature) => feature.toLowerCase());
  return (
    rankTrackerQualityPositionMatches(row, f.position) &&
    changeMatches(row, f.change) &&
    (!volumeRequested ||
      (volume !== null && volume >= f.volMin && (f.volMax >= 50 || volume <= f.volMax))) &&
    row.keyword.toLowerCase().includes(f.contains.trim().toLowerCase()) &&
    f.tags.every((tag) => row.tags.includes(tag)) &&
    (!f.topics.length || f.topics.includes(row.topic ?? "")) &&
    (!f.intents.length || f.intents.includes(row.intent ?? "")) &&
    f.serp.every((feature) => features.includes(feature.toLowerCase())) &&
    (f.lastCheck === "any" ||
      (f.lastCheck === "not_checked" ? !latest : latest?.status === f.lastCheck)) &&
    (!f.wrongUrl ||
      (row.rankQuality.current?.evidence === "positive" &&
        Boolean(row.expectedUrl) &&
        hasUrlMismatch({
          position: row.rankQuality.current.position,
          rankingUrl: row.rankingUrl,
          targetUrl: row.expectedUrl,
        }))) &&
    (!f.urlChanged ||
      (Boolean(row.rankQuality.current?.comparisonDigest) && row.rankingPages > 1)) &&
    (!search || terms.includes(search))
  );
}
