import type { ChartMarker } from "@/lib/annotations/marker-style";
import {
  type DailyClickPoint,
  dailyClicksAreEmpty,
} from "@/lib/search-insights/queries/daily-clicks-model";
import { MAX_MARKERS, MAX_SERIES_POINTS, percentChange } from "./period";
import type { ChallengeClicksTile, ChallengeExistingTile, ChallengeTopPagesTile } from "./schema";
import { unavailableTile } from "./tile-state";

function sumClicks(points: readonly DailyClickPoint[]) {
  return points.reduce((total, point) => total + (point.clicks ?? 0), 0);
}

function bucketClicks(points: readonly DailyClickPoint[], bucketDays: number) {
  const series: { date: string; clicks: number | null }[] = [];
  for (let index = 0; index < points.length; index += bucketDays) {
    const bucket = points.slice(index, index + bucketDays);
    series.push({
      date: bucket[0].dateKey,
      clicks: bucket.some((point) => point.clicks !== null) ? sumClicks(bucket) : null,
    });
  }
  return series;
}

export function buildClicksTile(input: {
  connected: boolean;
  current: readonly DailyClickPoint[];
  markers: readonly ChartMarker[];
  previous: readonly DailyClickPoint[];
}): ChallengeClicksTile {
  if (!input.connected) return unavailableTile("not_connected", "search_console");
  if (dailyClicksAreEmpty(input.current) && dailyClicksAreEmpty(input.previous)) {
    return unavailableTile("no_data", "empty");
  }
  const bucketDays = Math.max(
    1,
    Math.ceil(Math.max(input.current.length, input.previous.length) / MAX_SERIES_POINTS),
  );
  const currentSeries = bucketClicks(input.current, bucketDays);
  const currentDates = new Set(currentSeries.map((point) => point.date));
  const markers = input.markers
    .filter((marker) => currentDates.has(marker.dateKey))
    .slice(0, MAX_MARKERS)
    .map((marker) => ({
      ...(marker.added !== undefined ? { added: marker.added } : {}),
      dateKey: marker.dateKey,
      ...(marker.endDateKey ? { endDateKey: marker.endDateKey } : {}),
      ...(marker.generated ? { generated: marker.generated } : {}),
      id: marker.id,
      kind: marker.kind,
      ...(marker.removed !== undefined ? { removed: marker.removed } : {}),
      title: marker.title,
    }));
  const current = sumClicks(input.current);
  const previous = sumClicks(input.previous);
  return {
    current,
    ...(bucketDays > 1 ? { bucketDays } : {}),
    currentSeries,
    markers,
    percentChange: percentChange(current, previous),
    previous,
    previousSeries: bucketClicks(input.previous, bucketDays),
    state: "ok",
  };
}

export function buildTopPagesTile(input: {
  connected: boolean;
  pages: readonly { clicks: number; path: string }[];
}): ChallengeTopPagesTile {
  if (!input.connected) return unavailableTile("not_connected", "search_console");
  const pages = [...input.pages]
    .filter((page) => page.clicks > 0 && page.path.trim())
    .sort((left, right) => right.clicks - left.clicks || left.path.localeCompare(right.path))
    .slice(0, 5)
    .map((page) => ({ clicks: page.clicks, path: page.path.slice(0, 200) }));
  if (pages.length === 0) return unavailableTile("no_data", "empty");
  return { pages, state: "ok" };
}

export function buildExistingVsNewTile(input: {
  connected: boolean;
  existingClicks: number;
  existingPages: number;
  hasSnapshot: boolean;
  newClicks: number;
  newPages: number;
}): ChallengeExistingTile {
  if (!input.hasSnapshot) return unavailableTile("no_data", "no_snapshot");
  if (!input.connected) return unavailableTile("not_connected", "search_console");
  return {
    existingClicks: input.existingClicks,
    existingPages: input.existingPages,
    newClicks: input.newClicks,
    newPages: input.newPages,
    state: "ok",
  };
}
