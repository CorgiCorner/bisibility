import { type ChartMarker, chartMarkerKind } from "./marker-style";
import type { AnnotationCopy } from "./present";
import { chartMarkerTitleFields, presentAnnotations } from "./present";
import { annotationDayKey } from "./ruler";
import type { AnnotationSignalRecord, AnnotationUpdateRecord } from "./types";

export const CHART_MARKER_LIMIT = 200;

function conversionSourceName(source: string) {
  if (source === "ga4") return "Google Analytics 4";
  if (source === "plausible") return "Plausible";
  return "none";
}

const kindRank = {
  note: 0,
  search_engine: 1,
  deploy: 2,
  content: 3,
  sitemap: 4,
} as const;

export type ChartAnnotationRange = {
  fromKey: string;
  toKey: string;
};

/** English catalog strings used when a chart read has no request translator. */
export const englishAnnotationCopy: AnnotationCopy = {
  byActor: (actor) => `by ${actor}`,
  contentFallback: "Content updated",
  deindexedTitle: "URL removed from the index",
  deployFallback: "Deploy",
  detailContent: "From a CMS or content signal.",
  detailDeindexed: "This URL is no longer indexed.",
  detailDeploy:
    "From a deploy webhook. The provider, environment and deployment id are kept when they are sent.",
  detailGoogle:
    "Imported from the Google Search Status Dashboard. A rollout with a start and an end is a band, not a single day.",
  detailNote: "Manual note.",
  detailSitemap: "From the sitemap monitor. Added and removed URLs become annotations.",
  noteFallback: "Note",
  primaryConversion: (from, to) =>
    `Primary conversion source changed from ${conversionSourceName(from)} to ${conversionSourceName(to)}`,
  sitemapTitle: (added, removed) => `Sitemap: ${added} added, ${removed} removed`,
  sourceLabel: (kind) =>
    ({
      content: "Content",
      deploy: "Deploy",
      google: "Google update",
      note: "Note",
      sitemap: "Sitemap",
    })[kind],
};

export function shiftAnnotationDayKey(key: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(key);
  if (!match) return key;
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  const year = String(shifted.getUTCFullYear()).padStart(4, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function orderedRange(range: ChartAnnotationRange) {
  return range.fromKey <= range.toKey ? range : { fromKey: range.toKey, toKey: range.fromKey };
}

function overlaps(marker: ChartMarker, range: ChartAnnotationRange) {
  const end = marker.endDateKey ?? marker.dateKey;
  return marker.dateKey <= range.toKey && end >= range.fromKey;
}

/**
 * Notes, then Google updates, then the other kinds. The cap applies after that order so a
 * busy deploy feed cannot push a note or a rollout off the chart.
 */
export function boundChartMarkers(markers: readonly ChartMarker[]) {
  const ranked = [...markers].sort((left, right) => {
    const byKind = kindRank[left.kind] - kindRank[right.kind];
    if (byKind !== 0) return byKind;
    const byDate = right.dateKey.localeCompare(left.dateKey);
    if (byDate !== 0) return byDate;
    return left.id.localeCompare(right.id);
  });
  const seen = new Set<string>();
  const chosen: ChartMarker[] = [];
  for (const marker of ranked) {
    if (seen.has(marker.id)) continue;
    seen.add(marker.id);
    chosen.push(marker);
    if (chosen.length >= CHART_MARKER_LIMIT) break;
  }
  return chosen.sort(
    (left, right) => left.dateKey.localeCompare(right.dateKey) || left.id.localeCompare(right.id),
  );
}

export function chartMarkersFromRecords(input: {
  copy?: AnnotationCopy;
  range: ChartAnnotationRange;
  signals: readonly AnnotationSignalRecord[];
  timeZone: string;
  updates: readonly AnnotationUpdateRecord[];
}): ChartMarker[] {
  const bounds = orderedRange(input.range);
  const titleFields = new Map(
    input.signals.map((signal) => [signal.id, chartMarkerTitleFields(signal)]),
  );
  const entries = presentAnnotations({
    copy: input.copy ?? englishAnnotationCopy,
    rangeLabel: (start) => start,
    signals: input.signals,
    updates: input.updates,
  });
  const markers = entries.flatMap((entry) => {
    const dateKey = annotationDayKey(new Date(entry.happenedAt), input.timeZone);
    const endDateKey = entry.endsAt
      ? annotationDayKey(new Date(entry.endsAt), input.timeZone)
      : undefined;
    const fields = titleFields.get(entry.id);
    const generated = fields?.generated;
    const source = entry.subtitle.trim();
    const marker: ChartMarker = {
      dateKey,
      id: entry.id,
      kind: chartMarkerKind(entry.kind),
      title: generated ? "" : entry.title,
      ...(source ? { source } : {}),
      ...(generated ? { generated } : {}),
      ...(generated === "sitemapTitle"
        ? { added: fields?.added ?? 0, removed: fields?.removed ?? 0 }
        : {}),
      ...(generated === "primaryConversion"
        ? { from: fields?.from ?? "none", to: fields?.to ?? "none" }
        : {}),
      ...(endDateKey && endDateKey > dateKey ? { endDateKey } : {}),
    };
    return overlaps(marker, bounds) ? [marker] : [];
  });
  return boundChartMarkers(markers);
}
