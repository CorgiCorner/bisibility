import type { DefinitionBinding } from "./model";

/** Revision boundary only. Provider-proven effective scope and the existing metric kernel remain mandatory. */
export function definitionHorizonCompatibility(
  left: DefinitionBinding,
  right: DefinitionBinding,
  horizon: number,
  proof: Readonly<{ leftCompleteThrough: number | null; rightCompleteThrough: number | null }>,
) {
  if (
    left.projectId !== right.projectId ||
    left.keywordId !== right.keywordId ||
    left.targetRevision !== right.targetRevision ||
    left.policyRevision !== right.policyRevision
  )
    return { compatible: false, reason: "definition_boundary" as const };
  if (
    !Number.isSafeInteger(horizon) ||
    horizon < 1 ||
    ![proof.leftCompleteThrough, proof.rightCompleteThrough].every(
      (value) => value !== null && Number.isSafeInteger(value) && value >= horizon,
    )
  )
    return { compatible: false, reason: "unproven_prefix" as const };
  if (left.request.depth < horizon || right.request.depth < horizon)
    return { compatible: false, reason: "insufficient_depth" as const };
  return { compatible: true, reason: null };
}
