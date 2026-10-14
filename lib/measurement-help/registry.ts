import type { HelpCount } from "./types";

const rankCounts = [
  "expected",
  "measured",
  "metricEligible",
  "ranked",
  "knownAbsent",
  "unknown",
  "comparable",
] as const;
const qualityCounts = [
  "expected",
  "measured",
  "metricEligible",
  "freshDeterminate",
  "unknownFreshness",
  "unknown",
  "neverChecked",
  "failed",
  "stale",
  "unsupported",
  "comparable",
] as const;

function entry<const Metric extends string, const Version extends string>(
  metricId: Metric,
  definitionVersion: Version,
  kind: "metric" | "concept",
  contextFields: readonly HelpCount[] = [],
) {
  return Object.freeze({
    metricId,
    definitionVersion,
    kind,
    titleKey: `entries.${metricId}.title` as const,
    shortDefinitionKey: `entries.${metricId}.versions.${definitionVersion}.definition` as const,
    interpretationKey: `entries.${metricId}.versions.${definitionVersion}.interpretation` as const,
    limitationKey: `entries.${metricId}.versions.${definitionVersion}.limitation` as const,
    glossaryAnchor: `#measurement-${metricId.replaceAll("_", "-")}` as const,
    contextFields: Object.freeze([...contextFields]),
  });
}

/**
 * Metric versions match the emitted reports. Concepts describe semantics only:
 * help-v1 is a copy revision, never a calculation or provider capability version.
 * Keep historical entries when adding a new definition; do not replace them.
 */
export const measurementHelpRegistry = Object.freeze([
  entry("organic_visibility_top20", "v1", "metric", qualityCounts),
  entry("visibility_top20", "visibility-top20-v1", "metric", qualityCounts),
  entry("organic_top10_rate", "qualified-v1", "metric", rankCounts),
  entry("competitor_share_of_voice_top10", "bisibility-sov-top10-v2", "metric", [
    "expected",
    "measured",
    "unknown",
    "stale",
  ]),
  entry("organic_rank", "help-v1", "concept", rankCounts),
  entry("feature_presence", "help-v1", "concept"),
  entry("business_slot", "help-v1", "concept"),
  entry("maps_rank", "help-v1", "concept"),
  entry("local_finder_rank", "help-v1", "concept"),
  entry("average_ranked_position", "help-v1", "concept", rankCounts),
  entry("observation_time", "help-v1", "concept"),
  entry("data_quality", "help-v1", "concept", qualityCounts),
  entry("rank_movement", "help-v1", "concept", rankCounts),
  entry("ranking_url", "help-v1", "concept"),
  entry("provider_cost", "help-v1", "concept"),
  entry("measurement_depth", "help-v1", "concept"),
  entry("search_location", "help-v1", "concept"),
  entry("refresh_schedule", "help-v1", "concept"),
]);
