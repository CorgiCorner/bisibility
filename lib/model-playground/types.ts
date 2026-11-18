import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";
import {
  modelRoutingViolationSchema,
  modelWorkspaceIdSchema,
} from "@/lib/providers/model/routing-settings";
import {
  modelConsultedSourcesSchema,
  modelCostEvidenceSchema,
  modelEvidenceTotalsSchema,
  modelMoneySchema,
  modelRoutingAttemptCredentialsSchema,
  modelSourceUrlSchema,
  validateModelCostEvidenceCurrency,
  validateModelEvidenceTotals,
} from "@/lib/providers/model/transport-contract";
import { z } from "zod";

export type {
  ModelConsultedSources,
  ModelCostEvidence,
  ModelCostScope,
  ModelEvidenceTotals,
  ModelRoutingAttemptCredentials,
} from "@/lib/providers/model/transport-contract";
export { modelMoneySchema } from "@/lib/providers/model/transport-contract";

import {
  MODEL_PLAYGROUND_LIMITS,
  modelColumnSchema,
  type modelColumnSettingsSchema,
  modelIdSchema,
  modelPlaygroundDraftSchema,
  type modelPlaygroundLaunchSchema,
  utf8Bytes,
} from "./schema";
import { modelUsageSchema } from "./usage-schema";

export { modelUsageSchema } from "./usage-schema";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const reference = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

const citation = z
  .object({
    occurrenceId: reference,
    /** One source ID maps to one exact canonical retained URL within a column. */
    sourceId: reference,
    url: modelSourceUrlSchema,
    title: z.string().max(512).nullable(),
    /** UTF-16 offsets in the normalized retained answer, or both null if unavailable. */
    start: count,
    end: count,
  })
  .strict()
  .refine(
    (value) =>
      (value.start === null && value.end === null) ||
      (value.start !== null && value.end !== null && value.start < value.end),
    { message: "Citation offsets must form a range or both be unknown." },
  );

export const modelColumnResultSchema = z
  .object({
    version: z.literal(1),
    column: modelColumnSchema,
    /** Actual upstream identity, separate from the selected gateway; null means unreported. */
    actualProviderId: reference.nullable(),
    actualModelId: modelIdSchema.nullable(),
    resolvedWorkspaceId: modelWorkspaceIdSchema.nullable().optional(),
    routingViolation: modelRoutingViolationSchema.nullable().optional(),
    providerRequestId: reference.nullable(),
    state: z.enum(["completed", "partial", "failed", "unknown", "cancelled"]),
    failure: z
      .enum([
        "refused",
        "invalid_credentials",
        "rate_limited",
        "unsupported_model",
        "provider_error",
        "invalid_response",
        "timeout",
        "connection_changed",
        "accounting_unknown",
      ])
      .nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    answer: z
      .string()
      .refine(
        (value) =>
          !/[\uD800-\uDFFF]/u.test(value) &&
          utf8Bytes(value) <= MODEL_PLAYGROUND_LIMITS.answerBytes,
      )
      .nullable(),
    /** metadata is present only when retention omitted supplementary evidence. */
    truncation: z
      .object({
        provider: z.boolean(),
        application: z.boolean(),
        citations: z.boolean(),
        metadata: z.literal(true).optional(),
      })
      .strict(),
    citations: z.array(citation).max(MODEL_PLAYGROUND_LIMITS.citations),
    consultedSources: modelConsultedSourcesSchema.optional(),
    citationTotals: modelEvidenceTotalsSchema.optional(),
    costEvidence: modelCostEvidenceSchema.optional(),
    routingAttemptCredentials: modelRoutingAttemptCredentialsSchema.optional(),
    usage: modelUsageSchema,
    providerCost: modelMoneySchema,
    paymentReceipt: actionPaymentReceiptSchema.nullable(),
    rawEvidenceId: reference.nullable(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.resolvedWorkspaceId !== undefined && result.column.providerId !== "anthropic")
      ctx.addIssue({ code: "custom", message: "Observed workspace belongs to Anthropic." });
    const allowed = result.column.settings.allowedProviders;
    const outside =
      result.column.providerId === "vercel_ai_gateway" &&
      allowed !== undefined &&
      result.actualProviderId !== null &&
      !allowed.includes(result.actualProviderId as (typeof allowed)[number]);
    if (outside !== (result.routingViolation === "provider_outside_allowed_set"))
      ctx.addIssue({
        code: "custom",
        message: "Routing violation must agree with observed provider eligibility.",
      });
    if (Date.parse(result.finishedAt) < Date.parse(result.startedAt))
      ctx.addIssue({ code: "custom", message: "Completion cannot precede dispatch." });
    if (
      result.state === "completed" &&
      (result.answer === null ||
        result.failure !== null ||
        result.truncation.provider ||
        result.truncation.application)
    )
      ctx.addIssue({
        code: "custom",
        message: "A complete answer cannot be missing, failed or truncated.",
      });
    if (
      new Set(result.citations.map((item) => item.occurrenceId)).size !== result.citations.length ||
      result.citations.some(
        (item) => result.answer === null || (item.end !== null && item.end > result.answer.length),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Citations need unique occurrences within the retained answer.",
      });
    const sourceUrls = new Map<string, string>();
    for (const item of [...result.citations, ...(result.consultedSources?.sources ?? [])]) {
      const previous = sourceUrls.get(item.sourceId);
      if (previous !== undefined && previous !== item.url)
        ctx.addIssue({ code: "custom", message: "A source ID must have one canonical URL." });
      sourceUrls.set(item.sourceId, item.url);
    }
    if (result.citationTotals)
      validateModelEvidenceTotals(
        result.citationTotals,
        result.citations.length,
        result.truncation.citations,
        ctx,
      );
    if (result.costEvidence)
      validateModelCostEvidenceCurrency(
        result.costEvidence,
        ctx,
        result.providerCost.certainty === "unknown" ? undefined : result.providerCost.currency,
      );
    const receipt = result.paymentReceipt;
    if (
      receipt &&
      (receipt.option.providerId !== result.column.providerId ||
        receipt.option.connectionId !== result.column.connectionId ||
        receipt.option.fundingSource !== result.column.payment.fundingSource ||
        receipt.option.id !== result.column.payment.optionId)
    )
      ctx.addIssue({ code: "custom", message: "Payment receipt does not belong to this column." });
  });

/** Immutable server snapshot; wallet balances and credentials are deliberately absent. */
export const modelPlaygroundPreviewSchema = z
  .object({
    version: z.literal(1),
    previewId: z.uuid(),
    projectId: reference,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    configHash: digest,
    input: modelPlaygroundDraftSchema,
    columns: z
      .array(
        z
          .object({
            columnId: z.uuid(),
            accountDigest: digest,
            credentialVersion: digest,
            capabilityVersion: reference,
            rateCardVersion: reference.nullable(),
            providerEstimate: modelMoneySchema,
          })
          .strict(),
      )
      .min(1)
      .max(MODEL_PLAYGROUND_LIMITS.columns),
  })
  .strict()
  .superRefine((preview, ctx) => {
    if (
      Date.parse(preview.expiresAt) <= Date.parse(preview.createdAt) ||
      preview.columns.length !== preview.input.columns.length ||
      new Set(preview.columns.map((column) => column.columnId)).size !== preview.columns.length ||
      preview.columns.some(
        (column) => !preview.input.columns.some((input) => input.columnId === column.columnId),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Preview must bind every column once and have a valid expiry.",
      });
  });

export type ModelColumnSettings = z.infer<typeof modelColumnSettingsSchema>;
export type ModelColumn = z.infer<typeof modelColumnSchema>;
export type ModelPlaygroundInput = z.infer<typeof modelPlaygroundDraftSchema>;
export type ModelPlaygroundLaunch = z.infer<typeof modelPlaygroundLaunchSchema>;
export type ModelPlaygroundPreview = z.infer<typeof modelPlaygroundPreviewSchema>;
export type ModelColumnResult = z.infer<typeof modelColumnResultSchema>;
export type ModelUsage = z.infer<typeof modelUsageSchema>;
export type ModelMoney = z.infer<typeof modelMoneySchema>;

/** Report writers must apply both independent JSON byte budgets before persistence. */
export function serializeModelPlaygroundReport(
  results: readonly ModelColumnResult[],
  provenance: ModelPlaygroundPreview,
): { body: string; provenance: string } {
  const parsed = z
    .array(modelColumnResultSchema)
    .min(1)
    .max(MODEL_PLAYGROUND_LIMITS.columns)
    .parse(results);
  const preview = modelPlaygroundPreviewSchema.parse(provenance);
  if (
    new Set(parsed.map((result) => result.column.columnId)).size !== parsed.length ||
    parsed.some(
      (result) =>
        !preview.input.columns.some(
          (column) => JSON.stringify(column) === JSON.stringify(result.column),
        ),
    )
  )
    throw new Error("Results must belong to the frozen preview columns.");
  const body = JSON.stringify({ version: 1, columns: parsed });
  const encodedProvenance = JSON.stringify(preview);
  if (
    utf8Bytes(body) > MODEL_PLAYGROUND_LIMITS.reportBytes ||
    utf8Bytes(encodedProvenance) > MODEL_PLAYGROUND_LIMITS.provenanceBytes
  )
    throw new Error("Model Playground report exceeds the retained JSON byte budget.");
  return { body, provenance: encodedProvenance };
}
