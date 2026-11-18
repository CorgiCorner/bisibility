import type { ModelMoney } from "./types";
import type { ModelUsageBinding } from "./usage-contract";
import { shiftUsageDecimal } from "./usage-valuation";

/** The run estimate shows the customer's charge; native evidence retains the provider price. */
export function modelCustomerForecast(
  binding: Pick<ModelUsageBinding, "platform">,
  provider: ModelMoney,
): ModelMoney {
  if (!binding.platform) return provider;
  return {
    amount: shiftUsageDecimal(binding.platform.estimatedCustomerCents, -2),
    currency: "USD",
    certainty: "estimated",
    basis: "rate_card",
    rateCardVersion: binding.platform.customerPriceVersion,
  };
}
