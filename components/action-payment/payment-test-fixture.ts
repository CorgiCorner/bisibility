import type { ActionPaymentQuote } from "@/lib/action-payment/contract";

export function paymentQuote(overrides: Partial<ActionPaymentQuote> = {}): ActionPaymentQuote {
  const quote: ActionPaymentQuote = {
    id: "quote-1",
    quoteToken: "accepted-quote-1",
    expiresAt: "2099-01-01T00:00:00Z",
    option: {
      id: "route-1",
      connectionId: "conn_a00000000000000000000000",
      providerId: "future-provider",
      providerLabel: "Example provider",
      fundingSource: "byok",
      payableUnit: {
        kind: "provider_native",
        providerId: "future-provider",
        key: "tokens",
        singular: "token",
        plural: "tokens",
      },
    },
    charge: {
      value: "4",
      certainty: "estimate",
      unit: {
        kind: "provider_native",
        providerId: "future-provider",
        key: "tokens",
        singular: "token",
        plural: "tokens",
      },
    },
    cache: { state: "miss", freeUntil: null, windowSeconds: null },
    availability: { allowed: true, reason: null },
    ...overrides,
  };
  if (overrides.charge && !overrides.option)
    quote.option = { ...quote.option, payableUnit: overrides.charge.unit };
  return quote;
}
