import type { SubmissionOutcome } from "@/lib/local-monitoring/execution-types";
import type { OriginalLocalProofBinding } from "@/lib/local-monitoring-store/acceptance-proof";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { localToken, submissionOutcomeSchema } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";

export const originalCustodySchema = z
  .object({
    projectId: localToken,
    connectionId: localToken,
    provider: localToken,
    credentialVersion: localToken,
    correlationId: localToken,
    namespace: localToken,
    preparedAttemptId: localToken,
    preparedLeaseId: localToken,
    requestHash: localToken,
    attemptId: localToken,
    operationKey: localToken,
    targetKey: localToken,
    adapterVersion: localToken,
    device: z.enum(["desktop", "mobile"]),
    principal: localToken,
  })
  .strict()
  .refine((value) => value.attemptId === value.preparedAttemptId);
export type OriginalSubmitCustody = z.infer<typeof originalCustodySchema>;
export const originalSubmitProofSchema = z
  .object({
    version: z.literal(1),
    source: z.literal("dispatched_original_submit"),
    custody: originalCustodySchema,
    outcome: submissionOutcomeSchema,
    exhaustive: z.boolean(),
    bodyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.exhaustive !== (value.outcome.acceptance !== "unknown") ||
      value.bodyHash !== originalSubmitBodyHash(value.custody, value.outcome)
    )
      ctx.addIssue({ code: "custom", message: "Original submit proof identity changed." });
  });
export type OriginalSubmitProof = z.infer<typeof originalSubmitProofSchema>;
export function originalSubmitBodyHash(custody: OriginalSubmitCustody, outcome: SubmissionOutcome) {
  return localDigest({ version: 1, source: "dispatched_original_submit", custody, outcome });
}
export function normalizeOriginalProofBinding(
  binding: OriginalLocalProofBinding,
): OriginalLocalProofBinding {
  return {
    projectId: binding.projectId,
    connectionId: binding.connectionId,
    provider: binding.provider,
    credentialVersion: binding.credentialVersion,
    correlationId: binding.correlationId,
    namespace: binding.namespace,
    preparedAttemptId: binding.preparedAttemptId,
    preparedLeaseId: binding.preparedLeaseId,
    requestHash: binding.requestHash,
    attemptId: binding.attemptId,
    operationKey: binding.operationKey,
    targetKey: binding.targetKey,
    adapterVersion: binding.adapterVersion,
    device: binding.device,
  };
}
export function originalProofBinding(custody: OriginalSubmitCustody): OriginalLocalProofBinding {
  const { principal: _principal, ...binding } = custody;
  return binding;
}
