import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";

const targetRef = z.string().refine((value) => isPublicIdOfType(value, "lmt"));
export const monitorRetryRequestSchema = z
  .object({
    parentRunId: z.string().refine((value) => isPublicIdOfType(value, "lmr")),
    targetIds: z
      .array(targetRef)
      .min(1)
      .max(100)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export const monitorRetryApprovalSchema = monitorRetryRequestSchema
  .extend({
    version: z.literal(1),
    parentExpectedCount: z.number().int().min(1).max(100),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    selectedProofHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type MonitorRetryRequest = z.infer<typeof monitorRetryRequestSchema>;
export type MonitorRetryApproval = z.infer<typeof monitorRetryApprovalSchema>;
export type MonitorRetryReason =
  | "eligible_rejected"
  | "eligible_unsent"
  | "accepted_original"
  | "unknown_acceptance"
  | "in_progress"
  | "accounting_pending"
  | "reconciliation_pending"
  | "owner_retained"
  | "proof_unavailable";

export const monitorRetryFormSchema = z
  .object({
    connectionId: z.string().refine((value) => isPublicIdOfType(value, "conn")),
    targetIds: monitorRetryRequestSchema.shape.targetIds,
  })
  .strict();
