import type { z } from "zod";
import type * as schema from "./schema";

/** Adapter-supplied payment units; generic consumers never infer them from provider names. */
export type PaymentUnit = z.output<typeof schema.paymentUnitSchema>;

/** Nonnegative exact decimal text, in the named unit (currency values are major units). */
export type PaymentAmount = z.output<typeof schema.paymentAmountSchema>;

export type ActionPaymentOption = z.output<typeof schema.actionPaymentOptionSchema>;

export type ActionPaymentQuote = z.output<typeof schema.actionPaymentQuoteSchema>;

export type ActionPaymentReceipt = z.output<typeof schema.actionPaymentReceiptSchema>;

export type AcceptedActionPayment = z.output<typeof schema.acceptedActionPaymentSchema>;

export type ActionPaymentBatchAssessment = z.output<
  typeof schema.actionPaymentBatchAssessmentSchema
>;

export type ActionPaymentFailure = z.output<typeof schema.actionPaymentFailureSchema>;
