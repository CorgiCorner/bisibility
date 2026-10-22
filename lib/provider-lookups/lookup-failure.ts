import "server-only";

import type { BudgetDenialReason } from "@/lib/metering/budget-denial";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";

export type ProviderLookupFailure =
  | {
      payment?: import("@/lib/action-payment/contract").ActionPaymentReceipt;
      costCents?: number;
      ok: false;
      provider?: string;
      reason: "budget_exhausted";
      budgetReason?: BudgetDenialReason;
      resetAt?: number;
      surface?: ProviderRequestSurface;
    }
  | {
      payment?: import("@/lib/action-payment/contract").ActionPaymentReceipt;
      costCents?: number;
      estimatedCostCents?: number;
      ok: false;
      reason:
        | import("@/lib/action-payment/contract").ActionPaymentFailure
        | "wallet_budget_exhausted"
        | "insufficient_credits"
        | "cost_limit_exceeded"
        | "in_progress"
        | "needs_reauth"
        | "no_source"
        | "own_credentials_required"
        | "credentials_changed"
        | "rate_limited"
        | "provider_error"
        | "unsupported_location";
      resetAt?: number;
    };

export class ProviderLookupSignal extends Error {
  constructor(readonly outcome: ProviderLookupFailure) {
    super(outcome.reason);
  }
}
