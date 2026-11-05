import type { RankReportObservation } from "@/lib/rank-reports/records";

/** A retained normalized prefix can describe a result without changing report qualification. */
export function determinateHistoryAbsence(
  observation: RankReportObservation,
  recordedDepth?: number,
): observation is RankReportObservation & { requestedDepth: number } {
  return (
    observation.requestedDepth !== null &&
    observation.requestedDepth > 0 &&
    observation.reportedPosition === null &&
    ((observation.completeThrough !== null &&
      observation.completeThrough >= observation.requestedDepth) ||
      recordedDepth === observation.requestedDepth) &&
    (observation.evidence === "known_absent" ||
      ((observation.reason === "unproven_absence" || observation.reason === "insufficient_depth") &&
        observation.reportedPosition === null &&
        observation.completeness === "complete" &&
        observation.normalizationVersion === "v2"))
  );
}
