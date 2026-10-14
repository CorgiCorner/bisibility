import "server-only";
import type { EntityMatch } from "@/lib/business-locations/dto";
import { referenceSchema, timestampSchema } from "@/lib/business-locations/schema";
import type {
  BusinessMatchDecision,
  BusinessMatchHead,
  Prisma,
} from "@/lib/generated/prisma/client";
import { z } from "zod";
import type { BusinessTransaction } from "./context";
import { BusinessLocationConflictError, BusinessLocationUnavailableError } from "./errors";
import type { BusinessObservationSource } from "./observation-read";
import { MAX_BUSINESS_VERSION } from "./schema";

const ordinal = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
export const matchReplayProvenanceSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
    parserVersion: referenceSchema,
    codeHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type MatchReplayProvenance = z.infer<typeof matchReplayProvenanceSchema>;
const proofSchema = z
  .object({
    replay: matchReplayProvenanceSchema.optional(),
    normalizedItemHash: z.string().regex(/^[a-f0-9]{64}$/u),
    originalOrdinals: z
      .object({
        page: ordinal,
        block: ordinal,
        slot: ordinal,
        absolute: ordinal,
        group: ordinal.optional(),
        scale: z.enum(["maps_organic", "finder_group"]).nullable().optional(),
      })
      .strict(),
    promotion: z.enum(["organic", "promoted", "unknown"]),
    localResult: z.boolean(),
    organicEligible: z.boolean(),
    evidenceIdentifierTypes: z.array(z.enum(["cid", "place_id"])),
    source: z
      .object({
        provider: referenceSchema,
        adapterVersion: referenceSchema,
        normalizationVersion: referenceSchema.nullable(),
        originalObservedAt: timestampSchema,
        rankScale: referenceSchema.nullable(),
        sourceBlockId: referenceSchema.nullable(),
        sourceOrdinal: ordinal,
      })
      .strict(),
  })
  .strict();
export type StoredEntityMatch = EntityMatch &
  Readonly<{ observationSource: BusinessObservationSource }>;
export function storedMatch(row: BusinessMatchDecision): StoredEntityMatch {
  const proof = proofSchema.parse(row.evidence);
  if (
    Date.parse(proof.source.originalObservedAt) !== row.observedAt.getTime() ||
    !["confirmed", "candidate", "rejected", "unresolved"].includes(row.status) ||
    !["automatic", "manual", "rematch"].includes(row.source)
  )
    throw new BusinessLocationUnavailableError();
  return {
    projectId: row.projectId,
    entityId: row.entityId,
    identityRevisionId: row.identityRevisionId,
    observationRunId: row.observationRunId,
    itemId: row.itemId,
    observedAt: proof.source.originalObservedAt,
    matcherVersion: row.matcherVersion,
    status: row.status as EntityMatch["status"],
    matchedBy: row.matchedBy as EntityMatch["matchedBy"],
    reason: row.reason as EntityMatch["reason"],
    originalOrdinals: proof.originalOrdinals,
    promotion: proof.promotion,
    localResult: proof.localResult,
    organicEligible: proof.organicEligible,
    evidenceIdentifierTypes: proof.evidenceIdentifierTypes,
    observationSource: proof.source,
    id: row.id,
    decisionRevision: row.decisionRevision,
    previousDecisionId: row.previousDecisionId,
    source: row.source as EntityMatch["source"],
    confirmedBy: row.confirmedBy,
    recordedAt: row.recordedAt.toISOString(),
    reviewReason: row.reviewReason,
  };
}
export async function readMatchHeads(
  tx: BusinessTransaction,
  projectId: string,
  entityId: string,
  observationRunId: string,
  itemIds: readonly string[],
) {
  const heads = await tx.businessMatchHead.findMany({
    where: { projectId, entityId, observationRunId, itemId: { in: [...itemIds] } },
  });
  const rows = await tx.businessMatchDecision.findMany({
    where: {
      projectId,
      entityId,
      id: {
        in: heads.flatMap(({ currentDecisionId }) =>
          currentDecisionId ? [currentDecisionId] : [],
        ),
      },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(
    heads.map((head) => {
      const row = head.currentDecisionId ? byId.get(head.currentDecisionId) : null;
      if (
        (head.version > 0 && !row) ||
        (row &&
          (row.headId !== head.id ||
            row.itemId !== head.itemId ||
            row.observationRunId !== head.observationRunId ||
            row.decisionRevision !== head.version))
      )
        throw new BusinessLocationUnavailableError();
      const proof = row ? proofSchema.parse(row.evidence) : null;
      return [
        head.itemId,
        {
          head,
          current: row ? storedMatch(row) : null,
          source: proof?.source ?? null,
          normalizedItemHash: proof?.normalizedItemHash ?? null,
        },
      ];
    }),
  );
}
export async function appendStoredMatch(
  tx: BusinessTransaction,
  head: BusinessMatchHead,
  decision: EntityMatch,
  source: BusinessObservationSource,
  normalizedItemHash: string,
  replay?: MatchReplayProvenance,
) {
  if (head.version >= MAX_BUSINESS_VERSION || decision.decisionRevision !== head.version + 1)
    throw new BusinessLocationConflictError();
  const evidence = proofSchema.parse({
    ...(replay ? { replay } : {}),
    normalizedItemHash,
    originalOrdinals: decision.originalOrdinals,
    promotion: decision.promotion,
    localResult: decision.localResult,
    organicEligible: decision.organicEligible,
    evidenceIdentifierTypes: decision.evidenceIdentifierTypes,
    source,
  });
  await tx.businessMatchDecision.create({
    data: {
      id: decision.id,
      headId: head.id,
      projectId: decision.projectId,
      entityId: decision.entityId,
      identityRevisionId: decision.identityRevisionId,
      observationRunId: decision.observationRunId,
      itemId: decision.itemId,
      decisionRevision: decision.decisionRevision,
      previousDecisionId: decision.previousDecisionId,
      status: decision.status,
      matchedBy: decision.matchedBy,
      reason: decision.reason,
      source: decision.source,
      confirmedBy: decision.confirmedBy,
      reviewReason: decision.reviewReason,
      observedAt: new Date(decision.observedAt),
      recordedAt: new Date(decision.recordedAt),
      matcherVersion: decision.matcherVersion,
      evidence: evidence as Prisma.InputJsonValue,
    },
  });
  const updated = await tx.businessMatchHead.updateMany({
    where: {
      id: head.id,
      projectId: head.projectId,
      version: head.version,
      currentDecisionId: head.currentDecisionId,
    },
    data: { currentDecisionId: decision.id, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new BusinessLocationConflictError();
}
