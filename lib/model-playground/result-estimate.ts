import type { ModelColumnResult } from "./types";
import { createModelUsageReceipt } from "./usage";
import type { ModelUsageBinding } from "./usage-contract";
import { shiftUsageDecimal } from "./usage-valuation";

/** Read-only display estimate from frozen rates; never rewrites provider evidence or charges. */
export function modelResultWithUsageEstimate(
  result: ModelColumnResult,
  binding?: ModelUsageBinding,
): ModelColumnResult {
  if (!binding || result.providerCost.certainty !== "unknown" || result.costEvidence) return result;
  try {
    const receipt = createModelUsageReceipt(binding, result);
    const valuation = receipt.budgetValuation;
    if (
      receipt.usageStatus !== "complete" ||
      receipt.additionalExposure !== "none_reported" ||
      receipt.monetary.conflictReason ||
      valuation.certainty !== "estimated" ||
      valuation.cents === null ||
      !valuation.rateCardVersion
    )
      return result;
    return {
      ...result,
      providerCost: {
        amount: shiftUsageDecimal(valuation.cents, -2),
        currency: "USD",
        certainty: "estimated",
        basis: "rate_card",
        rateCardVersion: valuation.rateCardVersion,
      },
    };
  } catch {
    return result;
  }
}
