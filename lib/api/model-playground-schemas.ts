import { modelPlaygroundCatalogRequestSchema } from "@/lib/model-playground/catalog-request";
import {
  MODEL_PLAYGROUND_LIMITS,
  modelCatalogSnapshotSchema,
  modelColumnSchema,
  modelPlaygroundDraftSchema,
} from "@/lib/model-playground/schema";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { z } from "zod";
import { modelPlaygroundConnectionSchema } from "./model-playground-connection-schema";
import {
  bindModelPlaygroundResultCheck,
  demotedReadActive,
  providerCostsAgree,
} from "./model-playground-projection";
import {
  estimatedMoney,
  publicCostEvidenceSchema,
  publicProviderCostSchema,
  unknownMoney,
} from "./model-playground-public-cost";
import { modelPlaygroundOwnReceiptSchema } from "./model-playground-receipt-schema";

export {
  projectModelPlaygroundRun,
  providerCostsAgree,
  withDemotedRead,
} from "./model-playground-projection";

const reference = z.string().min(1).max(256);
export const modelPlaygroundRunIdSchema = z.uuid();
export const modelPlaygroundColumnSchema = modelColumnSchema.safeExtend({
  connectionId: modelPlaygroundConnectionSchema,
  payment: modelColumnSchema.shape.payment.safeExtend({ fundingSource: z.literal("byok") }),
});
const modelPlaygroundReadColumnSchema = modelColumnSchema.safeExtend({
  connectionId: z
    .string()
    .regex(/^(?:conn_[a-z][a-z0-9]{23}|platform:(?:openai|anthropic|openrouter))$/)
    .refine(
      (value): value is z.output<typeof modelColumnSchema.shape.connectionId> =>
        modelColumnSchema.shape.connectionId.safeParse(value).success,
    ),
});
export const modelPlaygroundPreviewInputSchema = modelPlaygroundDraftSchema.safeExtend({
  columns: z.array(modelPlaygroundColumnSchema).min(1).max(MODEL_PLAYGROUND_LIMITS.columns),
});
export const modelPlaygroundCatalogInputSchema = modelPlaygroundCatalogRequestSchema.safeExtend({
  connectionId: modelPlaygroundConnectionSchema,
});
export const modelPlaygroundConfirmationSchema = z
  .object({
    nonce: z.uuid(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    attemptIds: z.array(reference).min(1),
  })
  .strict()
  .refine((v) => new Set(v.attemptIds).size === v.attemptIds.length, "Attempt IDs must be unique.");
export const modelPlaygroundCreateSchema = z
  .object({
    version: z.literal(1),
    quoteId: z.uuid(),
    consent: z.literal("non_guaranteed_estimate_v1"),
    confirmUnknown: modelPlaygroundConfirmationSchema.optional(),
  })
  .strict();

const forecastMoney = z.discriminatedUnion("certainty", [estimatedMoney, unknownMoney]);
export const modelPlaygroundResultSchema = modelColumnResultSchema
  .safeExtend({
    column: modelPlaygroundReadColumnSchema,
    paymentReceipt: modelPlaygroundOwnReceiptSchema.nullable(),
    providerCost: publicProviderCostSchema,
    costEvidence: publicCostEvidenceSchema.optional(),
  })
  .superRefine((result, ctx) => {
    const receipt = result.paymentReceipt;
    if (!receipt?.providerCost) return;
    if (receipt.costEvidence === "mismatch") {
      if (receipt.providerCost.certainty !== "unknown" || receipt.providerCost.value !== null)
        ctx.addIssue({
          code: "custom",
          path: ["paymentReceipt", "providerCost"],
          message: "A mismatched receipt cost is unknown.",
        });
      return;
    }
    // Unknown agrees only with unknown. A projected read opts in for a demoted
    // estimate whose receipt stayed measured or free and whose localEstimate is set.
    if (
      demotedReadActive() &&
      result.providerCost.certainty === "unknown" &&
      (receipt.providerCost.certainty === "measured" ||
        receipt.providerCost.certainty === "free") &&
      result.costEvidence?.localEstimate != null
    )
      return;
    // An unknown receipt provider cost beside a reported result is returned unchanged.
    if (
      result.providerCost.certainty === "reported" &&
      receipt.providerCost.certainty === "unknown"
    )
      return;
    if (!providerCostsAgree(result.providerCost, receipt.providerCost))
      ctx.addIssue({
        code: "custom",
        path: ["paymentReceipt", "providerCost"],
        message: "Receipt and result must retain the same provider cost.",
      });
  });
bindModelPlaygroundResultCheck(modelPlaygroundResultSchema);
export const modelPlaygroundCatalogSchema = z
  .object({
    ...modelCatalogSnapshotSchema.shape,
  })
  .omit({ accountDigest: true })
  .strict();
export const modelPlaygroundPreviewSchema = z
  .object({
    version: z.literal(1),
    quoteId: z.uuid(),
    expiresAt: z.iso.datetime(),
    forecasts: z
      .array(
        z
          .object({
            columnId: z.uuid(),
            money: forecastMoney,
            complete: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(MODEL_PLAYGROUND_LIMITS.columns),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.forecasts.map((item) => item.columnId)).size === value.forecasts.length,
    "Forecast columns must be unique.",
  );
/** Read-scope estimate: not binding, so it has no quote ID, expiry or binding digest. */
export const modelPlaygroundEstimateSchema = z
  .object({
    version: z.literal(1),
    estimatedAt: z.iso.datetime(),
    /** Yes/no only: no budget amount, limit or usage is ever returned. */
    budgetAvailable: z.boolean(),
    forecasts: modelPlaygroundPreviewSchema.shape.forecasts,
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.forecasts.map((item) => item.columnId)).size === value.forecasts.length,
    "Forecast columns must be unique.",
  );
export const modelPlaygroundAttemptStateSchema = z.enum([
  "admitted",
  "in_flight",
  "stale_unknown",
  "observed",
  "refused",
  "acknowledged_unknown",
] as const);
export const modelPlaygroundAdmissionReasonSchema = z.enum([
  "service_paused",
  "confirmation_spent",
  "quote_missing",
  "quote_invalidated",
  "quote_expired",
  "quote_changed",
  "consent_required",
  "configuration_changed",
  "credential_changed",
  "connection_unavailable",
  "catalog_changed",
  "rate_card_changed",
  "budget_changed",
  "budget_exhausted",
  "budget_unavailable",
  "access_denied",
] as const);
export const modelPlaygroundAdmissionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("admitted"),
      quoteId: z.uuid(),
      runId: modelPlaygroundRunIdSchema,
      columnAttempts: z.record(z.uuid(), reference),
      attempts: z
        .array(
          z
            .object({ id: reference, columnId: z.uuid(), state: modelPlaygroundAttemptStateSchema })
            .strict(),
        )
        .min(1)
        .max(MODEL_PLAYGROUND_LIMITS.columns),
      replayed: z.boolean(),
      earlierAttemptUnconfirmed: z.boolean(),
      replacementRefusal: z
        .object({ reason: modelPlaygroundAdmissionReasonSchema, quoteInvalidated: z.literal(true) })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("confirmation_required"),
      ...modelPlaygroundConfirmationSchema.shape,
      earlierAttemptUnconfirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("not_dispatched"),
      reason: modelPlaygroundAdmissionReasonSchema,
      quoteInvalidated: z.literal(true),
    })
    .strict(),
]);
export const modelPlaygroundRunSchema = z
  .object({
    version: z.literal(1),
    runId: modelPlaygroundRunIdSchema,
    projectId: z.string().regex(/^prj_[a-z][a-z0-9]{23}$/),
    reportId: z
      .string()
      .regex(/^agr_[a-z][a-z0-9]{23}$/)
      .nullable(),
    prompt: modelPlaygroundDraftSchema.shape.prompt,
    responseLanguage: modelPlaygroundDraftSchema.shape.responseLanguage,
    columns: z
      .array(
        z
          .object({
            column: modelPlaygroundReadColumnSchema,
            state: z.enum([
              "queued",
              "claimed",
              "completed",
              "partial",
              "failed",
              "unknown",
              "cancelled",
            ]),
            attemptId: reference.nullable(),
            attemptState: modelPlaygroundAttemptStateSchema.nullable(),
            result: modelPlaygroundResultSchema.nullable(),
            resultIssue: z.enum(["unprojectable"]).nullable(),
          })
          .strict()
          .superRefine((column, ctx) => {
            if (column.resultIssue !== null && column.result !== null)
              ctx.addIssue({
                code: "custom",
                message: "An unprojectable column has no result.",
                path: ["result"],
              });
            if (
              column.state === "completed" &&
              column.result === null &&
              column.resultIssue === null
            )
              ctx.addIssue({
                code: "custom",
                message: "A completed column with no result is unprojectable.",
                path: ["resultIssue"],
              });
          }),
      )
      .min(1)
      .max(MODEL_PLAYGROUND_LIMITS.columns),
  })
  .strict();
