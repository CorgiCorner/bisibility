import type { MeasurementState, TrackingSource } from "@/lib/ai-tracking/contract";
import { findLiteralWordMatch } from "@/lib/ai-tracking/literal-match";

export interface TrendObservation {
  identity: string;
  measurement: MeasurementState;
  recordedSource: "fresh" | "cache";
  mentioned: boolean | null;
}

export function trackingDenominator(samples: readonly TrendObservation[], expected: number) {
  const fresh = samples.filter((sample) => sample.recordedSource === "fresh");
  const eligible = fresh.filter((sample) => sample.measurement === "answer_present");
  const absentAio = fresh.filter((sample) => sample.measurement === "aio_not_present").length;
  const complete = eligible.length + absentAio;
  return {
    expected,
    observed: fresh.length,
    eligible: eligible.length,
    mentioned: eligible.filter((sample) => sample.mentioned === true).length,
    absentAio,
    partial: fresh.filter((sample) => sample.measurement === "partial").length,
    failed: fresh.filter((sample) => sample.measurement === "failed").length,
    unknown: fresh.filter((sample) => ["unknown", "unavailable"].includes(sample.measurement))
      .length,
    missing: Math.max(0, expected - fresh.length),
    coverage: expected > 0 ? Math.min(1, complete / expected) : 0,
    mentionRate: eligible.length
      ? eligible.filter((sample) => sample.mentioned === true).length / eligible.length
      : null,
  };
}

export function compareTrackingPeriods(
  before: readonly TrendObservation[],
  after: readonly TrendObservation[],
  expectedBefore: number,
  expectedAfter: number,
) {
  const previous = trackingDenominator(before, expectedBefore);
  const current = trackingDenominator(after, expectedAfter);
  const keys = (samples: readonly TrendObservation[]) =>
    [...new Set(samples.map((sample) => sample.identity))].sort().join("\n");
  const sameIdentity = keys(before) === keys(after);
  const comparable = sameIdentity && previous.coverage >= 0.9 && current.coverage >= 0.9;
  return {
    previous,
    current,
    comparable,
    reason: !sameIdentity
      ? "Configuration changed"
      : !comparable
        ? "At least 90% complete coverage is required in both periods"
        : null,
    delta:
      comparable && previous.mentionRate !== null && current.mentionRate !== null
        ? current.mentionRate - previous.mentionRate
        : null,
  };
}

export const trackingSourceLabel: Record<TrackingSource, string> = {
  consumer_scrape: "Consumer scraper",
  model_api: "Model API",
  google_aio: "Google AI Overview",
};

export function heuristicAliasMatch(answer: string, aliases: readonly string[]) {
  for (const alias of aliases.filter((value) => value.trim().length > 1)) {
    const match = findLiteralWordMatch(answer, alias, true);
    if (match)
      return {
        method: "alias_heuristic" as const,
        alias,
        snippet: answer.slice(Math.max(0, match.index - 80), match.index + match.length + 80),
      };
  }
  return null;
}
