import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  frozenConfiguredScope,
  sameDefinitionBytes,
} from "@/lib/measurement-definitions/canonical";
import { bindingSchema } from "@/lib/measurement-definitions/storage";
import type { WebObservationRunInput } from "./types";

/** Historical revisions come from the retained owner binding, never adapter-provided IDs. */
export async function observationDefinitionForCheck(
  tx: Prisma.TransactionClient,
  projectId: string,
  rankCheckId: string,
  input: WebObservationRunInput,
  bindingId?: string | null,
) {
  if (!bindingId) {
    const retained = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM measurement_execution_bindings WHERE "projectId"=${projectId} AND "rankCheckId"=${rankCheckId} LIMIT 1`;
    if (retained.length) throw new Error("The winning measurement attempt binding is required.");
  }
  const rows = await tx.$queryRaw<unknown[]>`
    SELECT id,"projectId","keywordId","targetRevisionId" AS "targetRevision","policyRevisionId" AS "policyRevision",owner,request,source,"capturedAt"
    FROM measurement_execution_bindings
    WHERE id=${bindingId ?? ""} AND "projectId"=${projectId} AND "rankCheckId"=${rankCheckId}`;
  if (rows.length > 1 || (bindingId && rows.length !== 1))
    throw new Error("Original measurement binding is unavailable.");
  const evidence = input.requestPolicy.evidence;
  if (!rows.length) {
    return {
      definitionBindingId: null,
      input: {
        ...input,
        requestPolicy: {
          ...input.requestPolicy,
          ...(evidence
            ? { evidence: { ...evidence, targetRevision: null, policyRevision: null } }
            : {}),
        },
      },
    };
  }
  const binding = bindingSchema.parse(rows[0]);
  const verifiedEvidence = assertObservationOriginalBinding(binding, projectId, rankCheckId, input);
  return {
    definitionBindingId: binding.id,
    input: {
      ...input,
      requestPolicy: {
        ...input.requestPolicy,
        evidence: {
          ...verifiedEvidence,
          targetRevision: binding.targetRevision,
          policyRevision: binding.policyRevision,
        },
      },
    },
  };
}

/** Shared exact original request validation, without a database call or current settings. */
export function assertObservationOriginalBinding(
  binding: ReturnType<typeof bindingSchema.parse>,
  projectId: string,
  rankCheckId: string,
  input: WebObservationRunInput,
) {
  const evidence = input.requestPolicy.evidence;
  const configuredScope = frozenConfiguredScope(binding.source.target);
  if (
    binding.projectId !== projectId ||
    binding.owner.rankCheckId !== rankCheckId ||
    binding.request.providerId !== input.provider ||
    binding.request.depth !== input.requestPolicy.depth ||
    binding.request.stopOnMatch !== input.requestPolicy.stopOnMatch ||
    binding.request.findTargetsIn !== (input.requestPolicy.findTargetsIn ?? null) ||
    binding.request.forcedAiOverview !== input.requestPolicy.forcedAiOverview ||
    evidence?.adapterVersion !== binding.request.adapterVersion ||
    !sameDefinitionBytes(configuredScope, input.configuredScope)
  ) {
    throw new Error("Observation does not match its original measurement request.");
  }
  if (!evidence)
    throw new Error("Bound measurement observation requires provider evidence metadata.");
  return evidence;
}
