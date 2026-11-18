import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import { modelColumnSchema } from "@/lib/model-playground/schema";
import { z } from "zod";
import { modelPlaygroundConnectionSchema } from "./model-playground-connection-schema";

const reference = z.string().min(1).max(256);
const currencies = new Set(Intl.supportedValuesOf("currency"));
const currency = z
  .object({
    kind: z.literal("currency"),
    code: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .refine((code) => currencies.has(code)),
  })
  .strict();
const reportedAmount = z
  .object({
    value: paymentDecimalSchema.nullable(),
    unit: currency,
    certainty: z.enum(["measured", "free", "unknown"]),
  })
  .strict()
  .superRefine((amount, ctx) => {
    if ((amount.certainty === "unknown") !== (amount.value === null))
      ctx.addIssue({ code: "custom", message: "Only unknown money has a null value." });
    if (amount.certainty === "free" && !/^0(?:\.0+)?$/.test(amount.value ?? ""))
      ctx.addIssue({ code: "custom", message: "Free money is exactly zero." });
  });

/** Standalone own-key projection; never inherits future action-payment fields. */
export const modelPlaygroundOwnReceiptSchema = z
  .object({
    actionId: reference,
    quoteId: reference.nullable(),
    option: z
      .object({
        id: reference,
        connectionId: modelPlaygroundConnectionSchema,
        providerId: modelColumnSchema.shape.providerId,
        providerLabel: z
          .string()
          .min(1)
          .max(160)
          .refine((value) => value === value.trim() && !/\p{Cc}/u.test(value)),
        fundingSource: z.literal("byok"),
        payableUnit: currency,
      })
      .strict(),
    state: z.enum(["settled", "pending", "unknown", "free"]),
    charge: reportedAmount,
    providerCost: reportedAmount,
    /** Present only after a read degrades a disagreeing provider cost to unknown. */
    costEvidence: z.literal("mismatch").optional(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const expected =
      receipt.state === "settled" ? "measured" : receipt.state === "free" ? "free" : "unknown";
    if (
      receipt.charge.certainty !== expected ||
      receipt.charge.unit.code !== receipt.option.payableUnit.code ||
      receipt.providerCost.unit.code !== receipt.option.payableUnit.code
    )
      ctx.addIssue({
        code: "custom",
        message: "Receipt must retain its reported currency and certainty.",
      });
  });
