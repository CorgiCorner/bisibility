import { z } from "zod";
import { localToken, projectRef } from "./target-input-schema";

export { createTargetSchema, localToken, projectRef } from "./target-input-schema";

import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import type {
  SubmissionReconciliation,
  SubmissionRecord,
} from "@/lib/local-monitoring/execution-types";
import { type LocalQuote, localQuoteHash } from "@/lib/local-monitoring/quote";
import {
  initialSubmission,
  validateSubmissionOutcome,
  validateSubmissionReconciliation,
} from "@/lib/local-monitoring/submission-state";
import { executionTargetSchema, operationScopeSchema } from "@/lib/local-monitoring/target-key";

export const targetRef = z.string().refine((v) => isPublicIdOfType(v, "lmt"));
export const runRef = z.string().refine((v) => isPublicIdOfType(v, "lmr"));
const exact = z
  .string()
  .max(128)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u);
const iso = z.string().refine((v) => {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) && d.toISOString() === v;
});
export const localQuoteSchema: z.ZodType<LocalQuote> = z
  .object({
    version: z.literal(1),
    projectId: localToken,
    expectedTargetKeys: z.array(localToken).min(1).max(100),
    effectiveOptions: z.record(z.string(), localToken),
    capabilityVersion: localToken,
    provider: localToken,
    adapterVersion: localToken,
    providerPriceVersion: localToken,
    nativeEstimates: z
      .array(z.object({ unit: localToken, amount: exact.nullable() }).strict())
      .min(1)
      .max(20),
    issuedAt: iso,
    expiresAt: iso,
  })
  .strict()
  .superRefine((quote, ctx) => {
    try {
      localQuoteHash(quote);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid frozen quote." });
    }
  });
export const launchLocalSchema = z
  .object({
    projectId: projectRef,
    connectionId: z.string().refine((v) => isPublicIdOfType(v, "conn")),
    targetIds: z
      .array(targetRef)
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length),
    idempotencyKey: localToken,
    quote: localQuoteSchema,
    source: z.enum(["app", "worker", "api", "cli", "mcp", "sdk"]),
    trigger: z.enum(["manual", "scheduled"]),
  })
  .strict();
const usage = z
  .object({
    cached: z.boolean(),
    costCents: z.number().finite().nonnegative().nullable(),
    quantity: z.number().finite().nonnegative().nullable(),
    failed: z.boolean(),
    providerRequestId: localToken.optional(),
  })
  .strict();
export const submissionOutcomeSchema = z
  .object({
    acceptance: z.enum(["accepted", "rejected", "unknown"]),
    taskIds: z.array(localToken).max(100),
    receivedAt: iso,
    usage,
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      validateSubmissionOutcome(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid retained acceptance proof." });
    }
  });
export const submissionReconciliationSchema: z.ZodType<SubmissionReconciliation> = z
  .object({
    version: z.literal(1),
    kind: z.literal("provider_receipt"),
    proofId: localToken,
    attemptId: localToken,
    projectId: localToken,
    operationKey: localToken,
    targetKey: localToken,
    provider: localToken,
    adapterVersion: localToken,
    device: z.enum(["desktop", "mobile"]),
    verifiedAt: iso,
    exhaustive: z.boolean(),
    outcome: submissionOutcomeSchema,
  })
  .strict();
export const submissionRecordSchema: z.ZodType<SubmissionRecord> = z
  .object({
    key: localToken,
    version: z.number().int().nonnegative().max(2_147_483_647),
    scope: operationScopeSchema,
    targetKey: localToken,
    quoteHash: localToken,
    provider: localToken,
    adapterVersion: localToken,
    providerPriceVersion: localToken,
    status: z.enum(["claimed", "unknown_acceptance", "accepted", "rejected", "cancelled"]),
    attemptId: localToken.nullable(),
    outcome: submissionOutcomeSchema.nullable(),
    settlementRecorded: z.boolean(),
    cancellationRequested: z.boolean(),
    collectedEvidenceId: localToken.nullable(),
    originalOutcome: submissionOutcomeSchema.nullable().optional(),
    reconciliationHistory: z.array(submissionReconciliationSchema).max(32).optional(),
    pendingReconciliationReason: z.literal("collected_scope_conflict").nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      initialSubmission(value);
      const retained = value.attemptId !== null && value.outcome !== null;
      if (
        (value.status === "claimed" || value.status === "cancelled") &&
        ((value.status === "claimed" && value.attemptId !== null) ||
          value.outcome !== null ||
          value.settlementRecorded ||
          value.collectedEvidenceId !== null ||
          value.originalOutcome ||
          value.reconciliationHistory?.length ||
          value.pendingReconciliationReason)
      )
        throw new Error("Pre-send proof mismatch");
      if (value.status === "claimed" && value.cancellationRequested)
        throw new Error("Cancelled claim mismatch");
      if (value.status === "cancelled" && !value.cancellationRequested)
        throw new Error("Cancellation proof missing");
      if (
        value.status === "unknown_acceptance" &&
        (value.attemptId === null ||
          (value.outcome !== null && value.outcome.acceptance !== "unknown"))
      )
        throw new Error("Unknown acceptance binding mismatch");
      if (value.status === "accepted" && (!retained || value.outcome?.acceptance !== "accepted"))
        throw new Error("Accepted proof missing");
      if (value.status === "rejected" && (!retained || value.outcome?.acceptance !== "rejected"))
        throw new Error("Rejected proof missing");
      if (value.reconciliationHistory?.length && value.originalOutcome === undefined)
        throw new Error("Original transport proof snapshot missing");
      for (const proof of value.reconciliationHistory ?? [])
        validateSubmissionReconciliation(value, proof);
      if (
        new Set((value.reconciliationHistory ?? []).map(({ proofId }) => proofId)).size !==
        (value.reconciliationHistory?.length ?? 0)
      )
        throw new Error("Duplicate provider proof identity");
      if (
        value.pendingReconciliationReason &&
        (!value.collectedEvidenceId ||
          !value.reconciliationHistory?.length ||
          value.status !== "unknown_acceptance")
      )
        throw new Error("Pending immutable collection conflict lacks evidence");
      if (value.settlementRecorded && !retained) throw new Error("Native settlement proof missing");
      if (
        value.collectedEvidenceId !== null &&
        ((!value.settlementRecorded && !value.reconciliationHistory?.length) ||
          !value.outcome?.taskIds.length ||
          !["accepted", "unknown_acceptance"].includes(value.status))
      )
        throw new Error("Collection proof missing");
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid retained operation binding." });
    }
  });
export { executionTargetSchema };
