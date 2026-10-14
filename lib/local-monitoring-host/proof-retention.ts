import "server-only";
import type { SubmissionOutcome } from "@/lib/local-monitoring/execution-types";
import type { OriginalLocalProofBinding } from "@/lib/local-monitoring-store/acceptance-proof";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { submissionOutcomeSchema } from "@/lib/local-monitoring-store/schema";
import { originalLocalCustody } from "./custody";
import {
  OriginalSubmitProofConflictError,
  OriginalSubmitProofWriteError,
  originalProofStorageConflict,
} from "./errors";
import {
  type OriginalSubmitProof,
  originalSubmitBodyHash,
  originalSubmitProofSchema,
} from "./proof-schema";

/** Internal project-owned diagnostic proof. No amount projection, owner or finance mutation. */
export async function retainOriginalLocalSubmit(
  db: LocalDatabase,
  binding: OriginalLocalProofBinding,
  outcome: SubmissionOutcome,
) {
  const validated = submissionOutcomeSchema.parse(outcome);
  let custodyVerified = false;
  try {
    return await db.$transaction(async (tx) => {
      const original = await originalLocalCustody(tx, binding);
      custodyVerified = true;
      const value = originalSubmitProofSchema.parse({
        version: 1,
        source: "dispatched_original_submit",
        custody: original.custody,
        outcome: validated,
        exhaustive: validated.acceptance !== "unknown",
        bodyHash: originalSubmitBodyHash(original.custody, validated),
      });
      const namespace_attemptId = {
        namespace: original.item.namespace,
        attemptId: original.custody.attemptId,
      };
      await tx.localOriginalSubmitProof.createMany({
        data: [
          {
            ...namespace_attemptId,
            projectId: original.item.projectId,
            itemId: original.item.id,
            bodyHash: value.bodyHash,
            proof: value,
            receivedAt: new Date(validated.receivedAt),
          },
        ],
        skipDuplicates: true,
      });
      const stored = await tx.localOriginalSubmitProof.findUniqueOrThrow({
        where: { namespace_attemptId },
      });
      let retained: OriginalSubmitProof;
      try {
        retained = originalSubmitProofSchema.parse(stored.proof);
      } catch {
        throw new OriginalSubmitProofConflictError();
      }
      if (
        retained.bodyHash !== value.bodyHash ||
        stored.bodyHash !== value.bodyHash ||
        stored.projectId !== original.item.projectId ||
        stored.itemId !== original.item.id ||
        stored.receivedAt.toISOString() !== validated.receivedAt
      )
        throw new OriginalSubmitProofConflictError();
      return { proof: retained };
    });
  } catch (cause) {
    if (!custodyVerified || cause instanceof OriginalSubmitProofConflictError) throw cause;
    if (originalProofStorageConflict(cause)) throw new OriginalSubmitProofConflictError();
    throw new OriginalSubmitProofWriteError();
  }
}
