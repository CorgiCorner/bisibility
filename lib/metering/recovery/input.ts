import { z } from "zod";
import { TRIAGE_STATUSES } from "./contract";

export const MAX_RECOVERY_BATCH = 25;
export const recoveryFiltersSchema = z
  .object({
    category: z.enum(["all", "unfinished", "accounting", "failed", "historical"]).optional(),
    provider: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/)
      .optional(),
    cursor: z.string().max(32768).optional(),
  })
  .strict();
export const triageInputSchema = z
  .object({
    caseToken: z.string().min(1).max(32768),
    expectedVersion: z.string().min(1).max(128),
    status: z.enum(TRIAGE_STATUSES),
    reason: z
      .enum(["investigating", "provider_support", "waiting_export", "missing_proof"])
      .nullable(),
    assignToMe: z.boolean(),
    snoozedUntil: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.status === "waiting_evidence") !== (value.snoozedUntil !== null))
      ctx.addIssue({
        code: "custom",
        path: ["snoozedUntil"],
        message: "A waiting case requires a due date.",
      });
    if (["waiting_evidence", "escalated"].includes(value.status) && !value.reason)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Select an investigation reason.",
      });
  });
export const recoveryPreviewInputSchema = z
  .object({
    caseTokens: z.array(z.string().min(1).max(32768)).min(1).max(MAX_RECOVERY_BATCH),
  })
  .strict();
export const recoveryCommitInputSchema = z
  .object({
    previewToken: z.string().min(1).max(500000),
    commandId: z.uuid(),
  })
  .strict();
export type TriageInput = z.infer<typeof triageInputSchema>;
