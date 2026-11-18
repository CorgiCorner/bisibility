import { randomUUID } from "node:crypto";
import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import { z } from "zod";
import { modelPlaygroundDraftSchema } from "./schema";
import { type ModelPlaygroundInput, modelMoneySchema } from "./types";
import { modelUsageDigest } from "./usage";
import { modelUsageBindingSchema } from "./usage-contract";

const reference = z.string().min(1).max(256);
const quotedColumn = z
  .object({
    binding: modelUsageBindingSchema,
    catalogRevision: reference,
    maxOutputTokens: z.number().int().positive(),
    forecast: modelMoneySchema.refine(
      (money) => money.certainty !== "reported",
      "A forecast is estimated or unavailable.",
    ),
    advisory: z
      .object({
        cents: paymentDecimalSchema.max(40),
        basis: z.enum(["rate_card", "conservative_fallback", "price_unknown"]),
      })
      .strict(),
  })
  .strict();
export const modelPaymentContextSchema = z
  .object({
    namespace: reference,
    actorId: reference,
    projectId: reference,
    principal: reference,
    input: modelPlaygroundDraftSchema,
    budget: z.object({ id: reference, version: z.number().int().positive() }).strict(),
    columns: z.array(quotedColumn).min(1).max(6),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.columns.map((c) => c.binding.column.columnId);
    if (new Set(ids).size !== ids.length || ids.length !== value.input.columns.length)
      ctx.addIssue({ code: "custom", message: "A quote requires exactly one binding per column." });
    for (const column of value.columns) {
      const b = column.binding;
      const selected = value.input.columns.find((c) => c.columnId === b.column.columnId);
      if (
        b.projectId !== value.projectId ||
        b.principal !== value.principal ||
        b.connectionId.length === 0 ||
        modelUsageDigest(selected) !== modelUsageDigest(b.column) ||
        b.column.settings.maxOutputTokens > column.maxOutputTokens ||
        (column.forecast.certainty === "estimated" &&
          (column.forecast.rateCardVersion !== b.rateCard?.version ||
            column.advisory.basis === "price_unknown")) ||
        (column.forecast.certainty === "unknown" &&
          (column.advisory.basis !== "price_unknown" || column.advisory.cents !== "0"))
      )
        ctx.addIssue({
          code: "custom",
          message: "Quote identity, capability or valuation mismatch.",
        });
    }
  });
export type ModelPaymentContext = z.infer<typeof modelPaymentContextSchema>;
export const modelPaymentQuoteSchema = z
  .object({
    version: z.literal(1),
    quoteId: z.uuid(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    configHash: z.string().regex(/^[a-f0-9]{64}$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    context: modelPaymentContextSchema,
  })
  .strict();
export type ModelPaymentQuote = z.infer<typeof modelPaymentQuoteSchema>;
export type ModelAdmissionReason =
  | "service_paused"
  | "confirmation_spent"
  | "quote_missing"
  | "quote_invalidated"
  | "quote_expired"
  | "quote_changed"
  | "consent_required"
  | "configuration_changed"
  | "credential_changed"
  | "connection_unavailable"
  | "catalog_changed"
  | "rate_card_changed"
  | "budget_changed"
  | "budget_exhausted"
  | "budget_unavailable"
  | "access_denied";

/** Multiset identity: settings are hashed whole, including future workspace selection. */
export function modelContentHash(input: ModelPlaygroundInput) {
  const { columns, ...rest } = input;
  return modelUsageDigest({
    ...rest,
    columns: columns.map(({ columnId: _id, ...column }) => modelUsageDigest(column)).sort(),
  });
}

/** Server-owned snapshot only. Persist this before exposing its opaque ID to the client. */
export function createModelPaymentQuote(
  input: ModelPaymentContext,
  now = new Date(),
): ModelPaymentQuote {
  const context = structuredClone(modelPaymentContextSchema.parse(input));
  const quoteId = randomUUID();
  const configHash = modelUsageDigest(context.input);
  for (const column of context.columns) {
    column.binding.attemptId = `model:${quoteId}:${column.binding.column.columnId}`;
    column.binding.configHash = configHash;
  }
  return modelPaymentQuoteSchema.parse({
    version: 1,
    quoteId,
    configHash,
    contentHash: modelContentHash(context.input),
    context,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 600_000).toISOString(),
  });
}

export function validateModelPaymentQuote(
  quote: ModelPaymentQuote,
  current: ModelPaymentContext,
  now: Date,
): ModelAdmissionReason | null {
  if (Date.parse(quote.expiresAt) <= now.getTime()) return "quote_expired";
  const frozen = quote.context;
  if (
    frozen.actorId !== current.actorId ||
    frozen.projectId !== current.projectId ||
    frozen.principal !== current.principal ||
    frozen.namespace !== current.namespace
  )
    return "access_denied";
  if (quote.configHash !== modelUsageDigest(current.input)) return "configuration_changed";
  if (modelUsageDigest(frozen.budget) !== modelUsageDigest(current.budget)) return "budget_changed";
  for (const column of frozen.columns) {
    const live = current.columns.find(
      (c) => c.binding.column.columnId === column.binding.column.columnId,
    );
    if (!live) return "configuration_changed";
    const a = column.binding,
      b = live.binding;
    if (
      a.connectionId !== b.connectionId ||
      a.credentialVersion !== b.credentialVersion ||
      a.accountDigest !== b.accountDigest
    )
      return "credential_changed";
    if (
      column.catalogRevision !== live.catalogRevision ||
      a.capabilityVersion !== b.capabilityVersion ||
      column.maxOutputTokens !== live.maxOutputTokens ||
      modelUsageDigest(a.policy) !== modelUsageDigest(b.policy)
    )
      return "catalog_changed";
    if (modelUsageDigest(a.rateCard) !== modelUsageDigest(b.rateCard)) return "rate_card_changed";
    if (
      modelUsageDigest(column.forecast) !== modelUsageDigest(live.forecast) ||
      modelUsageDigest(column.advisory) !== modelUsageDigest(live.advisory) ||
      a.source !== b.source
    )
      return "quote_changed";
  }
  return null;
}

export class ModelAdmissionRefusal extends Error {
  constructor(readonly reason: ModelAdmissionReason) {
    super(reason);
  }
}
