import { compareQuantity, formatQuantity, type Quantity } from "@usagekit/core";
import { decimalQuantity } from "@usagekit/providers";

export class ProviderCostLimitError extends Error {
  constructor(
    readonly estimatedCostCents: number,
    readonly maxCostCents: number,
  ) {
    super("Provider request exceeds the accepted cost limit");
    this.name = "ProviderCostLimitError";
  }
}

/** Compare exact amounts before any reservation or provider dispatch. */
export function assertProviderCostLimit(estimate: readonly Quantity[], maximum?: string) {
  if (maximum === undefined) return;
  const cents = estimate.find((quantity) => quantity.unit === "cents");
  if (!cents) throw new Error("Cost consent requires a monetary estimate");
  if (maximum.startsWith("-") || compareQuantity(cents, decimalQuantity(maximum, "cents")) > 0)
    throw new ProviderCostLimitError(Number(formatQuantity(cents)), Number(maximum));
}
