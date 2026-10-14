import type {
  CollectedLocalResult,
  SubmissionRecord,
} from "@/lib/local-monitoring/execution-types";
import { isoTime } from "@/lib/local-monitoring/key";
import type { ExecutionTargetV1, PointRevision } from "@/lib/local-monitoring/types";
import type { ObservationRunInput } from "@/lib/observation/types";

export function assertLocalObservationProof(
  input: ObservationRunInput,
  record: SubmissionRecord,
  result: CollectedLocalResult,
  target: ExecutionTargetV1,
  point: PointRevision,
) {
  if (
    input.provider !== record.provider ||
    input.engine !== target.engine ||
    input.surface !== target.surface ||
    input.configuredScope.device !== target.device ||
    input.configuredScope.language !== target.language ||
    input.requestPolicy.depth !== target.cutoff
  )
    throw new Error("Observation does not belong to the original execution target.");
  const evidence = input.requestPolicy.evidence;
  if (
    !evidence ||
    evidence.version !== 1 ||
    evidence.adapterVersion !== record.adapterVersion ||
    evidence.targetRevision !== record.targetKey ||
    evidence.policyRevision !== target.policyRevision ||
    evidence.observedAt !== result.observedAt ||
    (evidence.completeThrough[target.resultKind] ?? null) !== result.completeThrough
  )
    throw new Error("Original observation evidence binding changed.");
  if (result.observedAt !== null) isoTime(result.observedAt);
  if (!Number.isFinite(input.executedAt.getTime()))
    throw new Error("Observation execution time is unavailable.");
  if (
    record.status === "unknown_acceptance" &&
    (input.completeness !== "unknown" || result.completeThrough !== null)
  )
    throw new Error("Partial acceptance cannot prove full coverage.");
  if (result.completeness !== "complete" && input.completeness === "complete")
    throw new Error("Partial collected results cannot become complete.");
  if (input.surface !== "web_serp") {
    if (
      input.requestPolicy.pointRevisionId !== point.revisionId ||
      input.requestPolicy.policyRevision !== target.policyRevision ||
      input.requestPolicy.cutoff !== target.cutoff ||
      input.requestPolicy.zoom !== target.zoom ||
      input.configuredScope.pointRevisionId !== point.revisionId ||
      input.configuredScope.coordinates.latitude !== point.coordinate.latitude ||
      input.configuredScope.coordinates.longitude !== point.coordinate.longitude ||
      input.configuredScope.zoom !== target.zoom
    )
      throw new Error("Neutral local point request proof changed.");
  }
  if (input.items.length > 10_000)
    throw new RangeError("Normalized observation exceeds bounded item count.");
  for (const item of input.items) {
    const compatible =
      input.surface === "maps"
        ? item.resultKind === "map_listing"
        : input.surface === "local_finder"
          ? item.resultKind === "listing"
          : ["organic_result", "local_pack", "ai_overview"].includes(item.resultKind);
    if (!compatible) throw new Error("Observation item belongs to another surface.");
    if (item.observedAt && !Number.isFinite(item.observedAt.getTime()))
      throw new Error("Invalid original item observation time.");
  }
}
