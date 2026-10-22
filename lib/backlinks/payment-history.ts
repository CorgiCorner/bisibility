import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";

export function retainedBacklinksPayment(receipt: ActionPaymentReceipt, provider: string) {
  const parsed = actionPaymentReceiptSchema.parse(receipt);
  if (parsed.option.providerId !== provider) throw new Error("Snapshot payment provider mismatch.");
  return parsed;
}

export function backlinksPaymentHistory(summary: unknown) {
  const record =
    summary && typeof summary === "object" && !Array.isArray(summary)
      ? (summary as Record<string, unknown>)
      : {};
  const original = actionPaymentReceiptSchema.safeParse(record._payment);
  const append = actionPaymentReceiptSchema.safeParse(record._appendPayment);
  return {
    ...(original.success ? { originalPayment: original.data } : {}),
    ...(append.success ? { appendPayment: append.data } : {}),
  };
}
