import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import {
  modelCostEvidenceSchema,
  modelCostScopeSchema,
  modelRoutingAttemptCredentialsSchema,
} from "@/lib/providers/model/transport-contract";
import { z } from "zod";
import { modelColumnSchema } from "./schema";
import { modelMoneySchema, modelUsageSchema } from "./types";

export const modelUsageDimensions = [
  "inputTokens",
  "outputTokens",
  "cacheReadInputTokens",
  "cacheWriteInputTokens",
  "reasoningTokens",
  "searchCalls",
  "searchContentTokens",
] as const;
const dimension = z.enum(modelUsageDimensions);
const reference = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const decimal = paymentDecimalSchema.max(80);
const rate = z
  .object({ dimension, usdPerUnit: decimal, ttlSeconds: z.number().int().positive().optional() })
  .strict();

/** Server-owned capability and rate snapshot, frozen before any paid dispatch. */
export const modelUsageBindingSchema = z
  .object({
    version: z.literal(1),
    feature: z.literal("model_playground"),
    fundingSource: z.enum(["byok", "platform"]),
    source: z.enum(["app", "worker", "api", "cli", "mcp", "sdk"]),
    attemptId: reference,
    projectId: reference,
    principal: reference,
    connectionId: reference,
    credentialVersion: digest,
    accountDigest: digest,
    configHash: digest,
    capabilityVersion: reference,
    platform: z
      .object({
        keyId: reference,
        customerPriceVersion: reference,
        estimatedProviderCents: decimal,
        estimatedCustomerCents: decimal,
      })
      .strict()
      .optional(),
    column: modelColumnSchema,
    policy: z
      .object({
        billableDimensions: z.array(dimension).min(2).max(7),
        cacheWriteTtls: z.array(z.number().int().positive()).max(8),
        inputCacheAccounting: z.enum(["included", "additional", "unknown"]),
        searchContentAccounting: z.enum(["included", "additional", "unknown"]),
      })
      .strict(),
    rateCard: z
      .object({
        version: reference,
        currency: z.literal("USD"),
        scope: modelCostScopeSchema,
        rates: z.array(rate).max(15),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((binding, ctx) => {
    const { policy, rateCard, column } = binding;
    if (
      binding.fundingSource !== column.payment.fundingSource ||
      (binding.fundingSource === "byok" && binding.platform !== undefined) ||
      (binding.fundingSource === "platform" &&
        (!binding.platform ||
          !["app", "worker"].includes(binding.source) ||
          binding.connectionId !== `platform:${binding.platform.keyId}` ||
          rateCard === null))
    )
      ctx.addIssue({ code: "custom", message: "Funding binding is incomplete or inconsistent." });
    const required = policy.billableDimensions;
    if (
      new Set(required).size !== required.length ||
      !required.includes("inputTokens") ||
      !required.includes("outputTokens") ||
      (column.settings.search.mode !== "off" && !required.includes("searchCalls")) ||
      new Set(policy.cacheWriteTtls).size !== policy.cacheWriteTtls.length ||
      (policy.cacheWriteTtls.length > 0 && !required.includes("cacheWriteInputTokens"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Billable dimensions must describe the selected capability.",
      });
    const keys =
      rateCard?.rates.map((rate) => `${rate.dimension}:${rate.ttlSeconds ?? "all"}`) ?? [];
    if (
      new Set(keys).size !== keys.length ||
      rateCard?.rates.some(
        (rate) =>
          !required.includes(rate.dimension) ||
          (rate.ttlSeconds !== undefined &&
            (rate.dimension !== "cacheWriteInputTokens" ||
              !policy.cacheWriteTtls.includes(rate.ttlSeconds))),
      )
    )
      ctx.addIssue({ code: "custom", message: "Rates must uniquely match billable dimensions." });
  });

export const modelUsageEvidenceSchema = z
  .object({
    providerRequestId: reference.nullable(),
    actualProviderId: reference.nullable(),
    actualModelId: reference.nullable(),
    failed: z.boolean(),
    occurredAt: z.iso.datetime(),
    usage: modelUsageSchema,
    providerCost: modelMoneySchema,
    costEvidence: modelCostEvidenceSchema.nullable(),
    routingAttemptCredentials: modelRoutingAttemptCredentialsSchema.optional(),
  })
  .strict();

export const modelNativeUsageReceiptSchema = z
  .object({
    version: z.enum(["model-native-v1", "model-native-v2"]),
    binding: modelUsageBindingSchema,
    evidence: modelUsageEvidenceSchema.nullable(),
    usageStatus: z.enum(["complete", "partial", "unknown"]),
    monetary: z
      .object({
        status: z.enum(["reported", "unavailable"]),
        total: modelMoneySchema.nullable(),
        conflictReason: z.enum(["provider_total_conflict", "upstream_exceeds_total"]).optional(),
      })
      .strict(),
    budgetValuation: z
      .object({
        certainty: z.enum(["estimated", "unknown"]),
        cents: decimal.nullable(),
        rateCardVersion: reference.nullable(),
      })
      .strict(),
    additionalExposure: z.enum(["none_reported", "unknown"]),
  })
  .strict()
  .refine(
    (receipt) =>
      receipt.version !== "model-native-v1" ||
      receipt.evidence?.routingAttemptCredentials === undefined,
    "Routing credential evidence requires a v2 receipt.",
  );

export type ModelUsageBinding = z.infer<typeof modelUsageBindingSchema>;
export type ModelUsageEvidence = z.infer<typeof modelUsageEvidenceSchema>;
export type ModelNativeUsageReceipt = z.infer<typeof modelNativeUsageReceiptSchema>;
export type ModelUsageDimension = (typeof modelUsageDimensions)[number];
