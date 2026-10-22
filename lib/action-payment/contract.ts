/** Adapter-supplied payment units; generic consumers never infer them from provider names. */
export type PaymentUnit =
  | { kind: "currency"; code: string }
  | { kind: "credits"; key: string; singular: string; plural: string }
  | { kind: "provider_native"; providerId: string; key: string; singular: string; plural: string };

/** Nonnegative exact decimal text, in the named unit (currency values are major units). */
export type PaymentAmount = {
  value: string | null;
  unit: PaymentUnit;
  certainty: "estimate" | "measured" | "free" | "unknown";
};

export type ActionPaymentOption = {
  id: string;
  connectionId: string;
  providerId: string;
  providerLabel: string;
  fundingSource: "byok" | "platform";
  payableUnit: PaymentUnit;
};

export type ActionPaymentQuote = {
  id: string;
  quoteToken: string;
  expiresAt: string;
  option: ActionPaymentOption;
  charge: PaymentAmount;
  maximumCharge?: { value: string; unit: PaymentUnit };
  cache: {
    state: "hit" | "miss" | "mixed" | "not_applicable";
    freeUntil: string | null;
    /** How long a paid fetch stays reusable. Null for a cache hit or when caching does not apply. */
    windowSeconds: number | null;
  };
  availability: { allowed: boolean; reason: string | null; remedyHref?: string };
  /** Server includes wallet details only with the existing owner-only billing permission. */
  wallet?: { available: PaymentAmount; canAddCredits: boolean; addCreditsHref?: string };
};

export type ActionPaymentReceipt = {
  actionId: string;
  quoteId: string | null;
  /** Retained execution identity, never today's connection configuration. */
  option: ActionPaymentOption;
  state: "settled" | "pending" | "unknown" | "free";
  charge: PaymentAmount;
  providerCost?: PaymentAmount;
};

export type AcceptedActionPayment = { quoteToken: string };

export type ActionPaymentBatchAssessment = {
  allowed: boolean;
  reason: string | null;
  charges: PaymentAmount[];
  wallet?: ActionPaymentQuote["wallet"];
  remedyHref?: string;
};

export type ActionPaymentFailure =
  | "payment_quote_changed"
  | "payment_quote_expired"
  | "payment_quote_required"
  | "payment_unavailable"
  | "payment_already_executed";
