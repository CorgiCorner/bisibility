import type { PaymentAmount } from "@/lib/action-payment/contract";

/** Daily bound for the selected questions. Unknown price card or an empty selection hides it. */
export function researchSelectionCost(perPromptUsd: number | null, count: number) {
  if (perPromptUsd == null || !Number.isFinite(perPromptUsd) || count <= 0) return null;
  return perPromptUsd * count;
}

/** A quote can be shown on the action only when the estimate named a non-free amount. */
export function researchQuoteIsPriced(charge: PaymentAmount | undefined) {
  if (!charge || charge.value == null || charge.certainty === "free") return false;
  return !/^0(?:\.0+)?$/.test(charge.value);
}
