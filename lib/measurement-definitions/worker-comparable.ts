import "server-only";
import { positionComparisonKey } from "@/lib/checks/position-observations";
import { prisma } from "@/lib/db/prisma";
import type { WebObservationRunInput } from "@/lib/observation/types";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "@/lib/rank-check/normalization-version";
import { frozenConfiguredScope } from "./canonical";
import type { DefinitionBinding } from "./model";

/** Bind real evidence to its selected owner. Scope/time/prefix evidence is never synthesized. */
export function workerBoundObservation(
  observation: WebObservationRunInput,
  binding: DefinitionBinding,
) {
  const evidence = observation.requestPolicy.evidence;
  return {
    ...observation,
    projectId: binding.projectId,
    configuredScope: frozenConfiguredScope(binding.source.target),
    requestPolicy: {
      ...observation.requestPolicy,
      ...(evidence
        ? {
            evidence: {
              ...evidence,
              targetRevision: binding.targetRevision,
              policyRevision: binding.policyRevision,
            },
          }
        : {}),
    },
  };
}
/** Only the newest completed measurement may be a predecessor; never reconnect across a changed epoch. */
export async function loadDefinitionComparablePrevious(
  binding: DefinitionBinding,
  observation?: WebObservationRunInput | null,
  position: number | null = null,
  checkedAt = new Date(),
) {
  if (!observation) return null;
  const currentKey = positionComparisonKey({
    checkedAt,
    normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
    position,
    provider: binding.request.providerId,
    requestedDepth: binding.request.depth,
    observationRun: workerBoundObservation(observation, binding),
  });
  if (!currentKey) return null;
  const latest = await prisma.rankCheck.findFirst({
    where: {
      keywordId: binding.keywordId,
      status: "completed",
      id: { not: binding.owner.rankCheckId },
    },
    include: { observationRun: true },
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
  });
  return latest && positionComparisonKey(latest) === currentKey ? latest : null;
}
