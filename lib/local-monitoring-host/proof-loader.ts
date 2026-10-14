import "server-only";
import type {
  SubmissionOutcome,
  SubmissionReconciliation,
} from "@/lib/local-monitoring/execution-types";
import type {
  LocalAcceptanceProofPort,
  OriginalLocalProofBinding,
} from "@/lib/local-monitoring-store/acceptance-proof";
import { localDigest, requireLocalTime } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { originalLocalCustody } from "./custody";
import { OriginalSubmitProofConflictError, OriginalSubmitProofUnavailableError } from "./errors";
import {
  normalizeOriginalProofBinding,
  type OriginalSubmitProof,
  originalProofBinding,
  originalSubmitProofSchema,
} from "./proof-schema";

function proof(
  binding: OriginalLocalProofBinding,
  outcome: SubmissionOutcome,
  proofId: string,
  now: Date,
): SubmissionReconciliation {
  return {
    version: 1,
    kind: "provider_receipt",
    proofId,
    attemptId: binding.attemptId,
    projectId: binding.projectId,
    operationKey: binding.operationKey,
    targetKey: binding.targetKey,
    provider: binding.provider,
    adapterVersion: binding.adapterVersion,
    device: binding.device,
    verifiedAt: requireLocalTime(now).toISOString(),
    exhaustive: outcome.acceptance !== "unknown",
    outcome,
  };
}
/** No credential resolution, retrieval, tasks_ready, invoice cost or paid transport is consulted. */
export function createOriginalLocalProofPort(db: LocalDatabase, clock: () => Date) {
  let evidence:
    | "retained_original_submit"
    | "retained_store_outcome"
    | "incomplete_original_submit_evidence"
    | "missing_original_submit_evidence" = "missing_original_submit_evidence";
  const port: LocalAcceptanceProofPort = {
    async loadVerifiedOriginalProof(binding) {
      return db.$transaction(async (tx) => {
        const original = await originalLocalCustody(tx, binding);
        const stored = await tx.localOriginalSubmitProof.findUnique({
          where: {
            namespace_attemptId: { namespace: binding.namespace, attemptId: binding.attemptId },
          },
        });
        if (stored) {
          let value: OriginalSubmitProof;
          try {
            value = originalSubmitProofSchema.parse(stored.proof);
          } catch {
            throw new OriginalSubmitProofConflictError();
          }
          if (
            stored.projectId !== original.item.projectId ||
            stored.itemId !== original.item.id ||
            stored.bodyHash !== value.bodyHash ||
            stored.receivedAt.toISOString() !== value.outcome.receivedAt ||
            value.custody.principal !== original.custody.principal ||
            localDigest(originalProofBinding(value.custody)) !==
              localDigest(normalizeOriginalProofBinding(binding))
          )
            throw new OriginalSubmitProofConflictError();
          evidence = value.exhaustive
            ? "retained_original_submit"
            : "incomplete_original_submit_evidence";
          return proof(binding, value.outcome, `original-local:${value.bodyHash}`, clock());
        }
        const known = (original.record.reconciliationHistory ?? [])
          .slice()
          .reverse()
          .find((entry) => entry.exhaustive && entry.outcome.acceptance !== "unknown");
        if (known) {
          evidence = "retained_store_outcome";
          return structuredClone(known);
        }
        const outcome = original.record.originalOutcome ?? original.record.outcome;
        if (
          !outcome ||
          (outcome.acceptance === "unknown" &&
            !outcome.taskIds.length &&
            outcome.usage.costCents === null &&
            outcome.usage.quantity === null)
        )
          throw new OriginalSubmitProofUnavailableError();
        evidence =
          outcome.acceptance === "unknown"
            ? "incomplete_original_submit_evidence"
            : "retained_store_outcome";
        return proof(
          binding,
          structuredClone(outcome),
          `local-store:${localDigest([normalizeOriginalProofBinding(binding), outcome])}`,
          clock(),
        );
      });
    },
  };
  return { port, evidence: () => evidence };
}
