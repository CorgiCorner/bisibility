import type { HelpTranslator } from "./types";

/** Synthetic, untranslated fixtures for tests/stories only, not a locale fallback. */
const messages: Record<string, string> = {
  explain: "Explain: {title}",
  close: "Close",
  glossary: "Full explanation: {title}",
  neutralDefinition:
    "This report identifies a measurement, but its detailed definition is unavailable.",
  unknownVersion: "Detailed definition unavailable for this version.",
  contextLoading: "Report context is loading. The definition remains available.",
  contextError: "Report context is unavailable. This does not mean a zero result.",
  unknownValue: "Unknown",
  "counts.expected": "Expected targets",
  "counts.measured": "Determinate observed targets",
  "counts.metricEligible": "Metric-eligible targets",
  "counts.ranked": "Ranked targets",
  "counts.knownAbsent": "Confirmed absent",
  "counts.unknown": "Unknown results",
  "counts.neverChecked": "Never observed",
  "counts.failed": "Failed attempts",
  "counts.stale": "Stale observations",
  "counts.unsupported": "Unsupported",
  "counts.freshDeterminate": "Fresh determinate targets",
  "counts.unknownFreshness": "Targets with unknown freshness",
  "counts.comparable": "Comparable paired targets",
  "entries.organic_visibility_top20.title": "Organic visibility",
  "entries.organic_visibility_top20.versions.v1.definition":
    "A versioned index of organic results in the first 20 positions.",
  "entries.organic_visibility_top20.versions.v1.interpretation":
    "Read the index alongside measured and expected targets.",
  "entries.organic_visibility_top20.versions.v1.limitation":
    "This is not traffic, leads, or local business placement.",
  "entries.average_ranked_position.title": "Average ranked position",
  "entries.average_ranked_position.versions.help-v1.definition":
    "Average position among targets with a confirmed positive rank.",
  "entries.average_ranked_position.versions.help-v1.interpretation":
    "Read ranked count and coverage alongside the average.",
  "entries.average_ranked_position.versions.help-v1.limitation":
    "Losing observations alone does not prove improvement.",
};

export const fixtureTranslate: HelpTranslator = (key, values) => {
  let text = messages[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {}))
    text = text.replaceAll(`{${name}}`, String(value));
  return text;
};

export const partialReport = Object.freeze({
  counts: {
    expected: 2,
    measured: 1,
    ranked: 1,
    unknown: 1,
    comparable: 1,
    freshDeterminate: null,
  },
  // Sensitive/raw fields must never reach help output or its context.
  contributions: [{ targetId: "synthetic-private-target", value: 100 }],
  raw: "<script>private-provider-payload</script>",
  recordedAt: "2026-10-10T12:00:00Z",
  observedAt: "2026-10-09T12:00:00Z",
  cached: true,
});
