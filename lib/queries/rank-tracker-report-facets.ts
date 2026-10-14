import type { LensLocationOption } from "@/lib/keywords/lens-model";
import type { RankTrackerListFacets } from "@/lib/keywords/rank-tracker-query-types";
import { rankTrackerQualityPositionMatches } from "./rank-tracker-report-filter";
import type { RankTrackerQualityRow } from "./rank-tracker-report-model";

type LocationLabel = Pick<
  RankTrackerQualityRow["location"],
  "canonicalKey" | "displayName" | "kind" | "languageLabel"
>;
function locationName(location: LocationLabel) {
  return location.languageLabel
    ? `${location.displayName} / ${location.languageLabel}`
    : location.displayName;
}

export function rankTrackerReportLocations(
  rows: readonly RankTrackerQualityRow[],
  registeredLocations: readonly LocationLabel[] = [],
): LensLocationOption[] {
  const groups = new Map<string, LensLocationOption>();
  for (const location of registeredLocations) {
    groups.set(location.canonicalKey, {
      count: 0,
      displayName: locationName(location),
      id: location.canonicalKey,
      kind: location.kind,
    });
  }
  for (const row of rows) {
    const location = row.location;
    const previous = groups.get(location.canonicalKey);
    groups.set(location.canonicalKey, {
      count: (previous?.count ?? 0) + 1,
      displayName: locationName(location),
      id: location.canonicalKey,
      kind: location.kind,
    });
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.id.localeCompare(b.id, "en-US"),
  );
}

function values(
  rows: readonly RankTrackerQualityRow[],
  read: (row: RankTrackerQualityRow) => readonly string[],
) {
  const counts = new Map<string, number>();
  for (const row of rows)
    for (const value of new Set(read(row).filter((value) => value.trim())))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, "en-US"))
    .map(([label, count]) => ({ count, label }));
}

/** Facets describe the entire current lens, never just the displayed page. */
export function rankTrackerReportFacets(
  rows: readonly RankTrackerQualityRow[],
): RankTrackerListFacets {
  return {
    intents: values(rows, (row) => (row.intent ? [row.intent] : [])),
    positions: (
      [
        { id: "top3", label: "Top 3" },
        { id: "top10", label: "Top 10" },
        { id: "11-50", label: "11-50" },
        { id: "51-100", label: "51-100" },
      ] as const
    ).map(({ id, label }) => ({
      count: rows.filter((row) => rankTrackerQualityPositionMatches(row, [id])).length,
      id,
      label,
    })),
    tags: values(rows, (row) => row.tags),
    topics: values(rows, (row) => (row.topic ? [row.topic] : [])),
  };
}
