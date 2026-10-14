import { frozenConfiguredScope } from "./canonical";
import type { DefinitionBinding } from "./model";

/** Merge only these definition fields into real provider evidence. Effective scope/time/completeness are provider-owned. */
export function capturedDefinitionProof(binding: DefinitionBinding) {
  return {
    targetRevision: binding.targetRevision,
    policyRevision: binding.policyRevision,
    configuredScope: frozenConfiguredScope(binding.source.target),
    requestedDepth: binding.request.depth,
  };
}
