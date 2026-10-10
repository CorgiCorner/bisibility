import "server-only";

import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";

export type ProviderLookupFailure =
  | {
      costCents?: number;
      ok: false;
      provider?: string;
      reason: "budget_exhausted";
      resetAt?: number;
      surface?: ProviderRequestSurface;
    }
  | {
      costCents?: number;
      estimatedCostCents?: number;
      ok: false;
      reason:
        | "cost_limit_exceeded"
        | "in_progress"
        | "needs_reauth"
        | "no_source"
        | "own_credentials_required"
        | "credentials_changed"
        | "rate_limited"
        | "unsupported_location";
      resetAt?: number;
    };

export class ProviderLookupSignal extends Error {
  constructor(readonly outcome: ProviderLookupFailure) {
    super(outcome.reason);
  }
}
