import { type ObservationCompleteness, observationCompleteness } from "@/lib/observation/types";
import { DEFAULT_SERP_DEPTH } from "./constants";

export const TRACKED_DEPTH_NOT_FOUND_LABEL = `Not found in top ${DEFAULT_SERP_DEPTH}`;

export type RankObservationState =
  | { kind: "pending"; label: "No data"; position: null }
  | { kind: "unknown"; label: "Coverage unknown"; position: null }
  | { kind: "not_ranked"; label: string; position: null }
  | { kind: "ranked"; label: string; position: number };

export function notRankedLabel(trackedDepth = DEFAULT_SERP_DEPTH) {
  return `Not in top ${trackedDepth}`;
}

export function normalizedObservationCompleteness(
  value: string | null | undefined,
): ObservationCompleteness | null {
  return observationCompleteness.find((completeness) => completeness === value) ?? null;
}

export function hasIncompleteObservation(completeness: string | null | undefined) {
  return completeness === "unknown" || completeness === "truncated_by_stop_on_match";
}

/** Separate never checked from a completed no-position observation at the domain boundary. */
export function rankObservationState(input: {
  completedChecks: number;
  completeness?: string | null;
  position: number | null | undefined;
  trackedDepth?: number;
}): RankObservationState {
  if (input.completedChecks <= 0) return { kind: "pending", label: "No data", position: null };
  const trackedDepth = input.trackedDepth ?? DEFAULT_SERP_DEPTH;
  if (typeof input.position !== "number" || input.position <= 0 || input.position > trackedDepth) {
    if (hasIncompleteObservation(input.completeness))
      return { kind: "unknown", label: "Coverage unknown", position: null };
    return { kind: "not_ranked", label: notRankedLabel(trackedDepth), position: null };
  }
  return { kind: "ranked", label: `#${input.position}`, position: input.position };
}

export function isPositionOutsideTrackedDepth(position: number, trackedDepth = DEFAULT_SERP_DEPTH) {
  return position > trackedDepth;
}

export function hasTrackedPosition(row: { hasRankData: boolean; position: number }) {
  return row.hasRankData && !isPositionOutsideTrackedDepth(row.position);
}
