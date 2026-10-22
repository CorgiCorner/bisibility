import type { PaymentUnit } from "./contract";

export type ProviderPaymentDescriptor = {
  unit: PaymentUnit;
  basis: "provider_cost" | "provider_quantity";
  estimateQuantity?(feature: string, itemCount: number): string | null;
};
export function resolveProviderPayment(
  provider: {
    payment?: ProviderPaymentDescriptor;
    paymentFor?(feature: string): ProviderPaymentDescriptor | null;
  },
  feature: string,
) {
  return provider.paymentFor ? provider.paymentFor(feature) : (provider.payment ?? null);
}
