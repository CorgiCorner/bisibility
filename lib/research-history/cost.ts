import type { PaymentAmount } from "@/lib/action-payment/contract";
import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";
import type { HistoryCost } from "./contract";

function centsAmount(cents: number): PaymentAmount {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return {
    certainty: "measured",
    unit: { kind: "currency", code: "USD" },
    value: `${negative ? "-" : ""}${whole}.${fraction}`,
  };
}

/** A missing receipt is unknown. A free or zero charge is the stored "cached" marker. */
export function historyCostFromReceipt(value: unknown, cached = false): HistoryCost {
  const parsed = actionPaymentReceiptSchema.safeParse(value);
  if (!parsed.success) return cached ? { kind: "cached" } : { kind: "unknown" };
  const charge = parsed.data.charge;
  if (cached || parsed.data.state === "free" || charge.certainty === "free")
    return { kind: "cached" };
  if (charge.certainty === "unknown" || charge.value === null) return { kind: "unknown" };
  return { kind: "amount", amount: charge };
}

export function historyCostFromCents(cents: number | null): HistoryCost {
  if (cents === 0) return { kind: "cached" };
  if (cents == null || !Number.isFinite(cents)) return { kind: "unknown" };
  return { kind: "amount", amount: centsAmount(cents) };
}
