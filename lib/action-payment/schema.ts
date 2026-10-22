import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";
import type { PaymentUnit } from "./contract";

const text = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim() && !/\p{Cc}/u.test(value));
const key = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/);
const id = z.string().min(1).max(256);
const currencyCodes = new Set(Intl.supportedValuesOf("currency"));
const localHref = z
  .string()
  .max(2048)
  .regex(/^\/(?!\/)[^\\\s]*$/);
const token = z.string().min(1).max(16384);
export const paymentDecimalSchema = z
  .string()
  .max(2048)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const paymentUnitSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("currency"),
      code: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .refine((code) => currencyCodes.has(code)),
    })
    .strict(),
  z.object({ kind: z.literal("credits"), key, singular: text, plural: text }).strict(),
  z
    .object({
      kind: z.literal("provider_native"),
      providerId: key,
      key,
      singular: text,
      plural: text,
    })
    .strict(),
]);

export function samePaymentUnit(left: PaymentUnit, right: PaymentUnit): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "currency") return right.kind === "currency" && left.code === right.code;
  return (
    right.kind !== "currency" &&
    left.key === right.key &&
    left.singular === right.singular &&
    left.plural === right.plural &&
    (left.kind !== "provider_native" ||
      (right.kind === "provider_native" && left.providerId === right.providerId))
  );
}

export const paymentAmountSchema = z
  .object({
    value: paymentDecimalSchema.nullable(),
    unit: paymentUnitSchema,
    certainty: z.enum(["estimate", "measured", "free", "unknown"]),
  })
  .strict()
  .superRefine((amount, context) => {
    if ((amount.certainty === "unknown") !== (amount.value === null))
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Only an unknown amount has no value.",
      });
    if (amount.certainty === "free" && !/^0(?:\.0+)?$/.test(amount.value ?? ""))
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "A free amount must be exactly zero.",
      });
  });

export const actionPaymentOptionSchema = z
  .object({
    id,
    connectionId: z.string().refine((value): boolean => isPublicIdOfType(value, "conn")),
    providerId: key,
    providerLabel: text,
    fundingSource: z.enum(["byok", "platform"]),
    payableUnit: paymentUnitSchema,
  })
  .strict()
  .superRefine((option, context) => {
    if (
      option.payableUnit.kind === "provider_native" &&
      option.payableUnit.providerId !== option.providerId
    )
      context.addIssue({
        code: "custom",
        path: ["payableUnit"],
        message: "Native payment unit belongs to another provider.",
      });
  });

const maximumSchema = z.object({ value: paymentDecimalSchema, unit: paymentUnitSchema }).strict();
export const actionPaymentQuoteSchema = z
  .object({
    id,
    quoteToken: token,
    expiresAt: z.iso.datetime({ offset: true }),
    option: actionPaymentOptionSchema,
    charge: paymentAmountSchema,
    maximumCharge: maximumSchema.optional(),
    cache: z
      .object({
        state: z.enum(["hit", "miss", "mixed", "not_applicable"]),
        freeUntil: z.iso.datetime({ offset: true }).nullable(),
        windowSeconds: z.number().int().positive().nullable(),
      })
      .strict(),
    availability: z
      .object({ allowed: z.boolean(), reason: text.nullable(), remedyHref: localHref.optional() })
      .strict(),
    wallet: z
      .object({
        available: paymentAmountSchema,
        canAddCredits: z.boolean(),
        addCreditsHref: localHref.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((quote, context) => {
    if (!samePaymentUnit(quote.option.payableUnit, quote.charge.unit))
      context.addIssue({
        code: "custom",
        path: ["charge", "unit"],
        message: "Charge unit differs from the accepted option.",
      });
    if (quote.maximumCharge && !samePaymentUnit(quote.option.payableUnit, quote.maximumCharge.unit))
      context.addIssue({
        code: "custom",
        path: ["maximumCharge", "unit"],
        message: "Maximum must use this option's payment unit.",
      });
    if (quote.cache.state === "hit" && quote.charge.certainty !== "free")
      context.addIssue({
        code: "custom",
        path: ["charge"],
        message: "A cache-only quote must be free.",
      });
    if (quote.availability.allowed !== (quote.availability.reason === null))
      context.addIssue({
        code: "custom",
        path: ["availability"],
        message: "Unavailable quotes need a reason; allowed quotes have none.",
      });
  });

export const actionPaymentReceiptSchema = z
  .object({
    actionId: id,
    quoteId: id.nullable(),
    option: actionPaymentOptionSchema,
    state: z.enum(["settled", "pending", "unknown", "free"]),
    charge: paymentAmountSchema,
    providerCost: paymentAmountSchema.optional(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (!samePaymentUnit(receipt.option.payableUnit, receipt.charge.unit))
      context.addIssue({
        code: "custom",
        path: ["charge", "unit"],
        message: "Receipt charge differs from its retained payment option.",
      });
    const certainty =
      receipt.state === "settled" ? "measured" : receipt.state === "free" ? "free" : "unknown";
    if (receipt.charge.certainty !== certainty)
      context.addIssue({
        code: "custom",
        path: ["charge"],
        message: "Receipt amount must retain its settlement certainty.",
      });
  });

export const acceptedActionPaymentSchema = z.object({ quoteToken: token }).strict();
export const actionPaymentBatchAssessmentSchema = z
  .object({
    allowed: z.boolean(),
    reason: z.string().min(1).nullable(),
    charges: z.array(paymentAmountSchema).min(1).max(50),
    wallet: actionPaymentQuoteSchema.shape.wallet,
    remedyHref: z.string().startsWith("/").optional(),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (assessment.allowed !== (assessment.reason === null))
      context.addIssue({ code: "custom", message: "Unavailable assessments need a reason." });
    if (
      assessment.remedyHref &&
      (assessment.reason !== "insufficient_credits" || !assessment.wallet?.canAddCredits)
    )
      context.addIssue({
        code: "custom",
        message: "Only an authorized insufficient-credit remedy can offer a top-up.",
      });
  });
export const actionPaymentFailureSchema = z.enum([
  "payment_quote_changed",
  "payment_quote_expired",
  "payment_quote_required",
  "payment_unavailable",
  "payment_already_executed",
]);
