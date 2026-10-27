import type { BudgetDenialReason } from "@/lib/metering/budget-denial";
import { budgetExhaustedResponse } from "./budget-exhausted";
import type { ApiContext } from "./context";
import { errorResponse } from "./responses";
import { retryHeaders } from "./retry-headers";

type CommonLookupFailure = {
  reason: string;
  budgetReason?: BudgetDenialReason;
  provider?: string;
  estimatedCostCents?: number;
  resetAt?: number;
};

export function commonLookupFailureResponse(
  ctx: ApiContext,
  outcome: CommonLookupFailure,
  details?: unknown,
): Response | null {
  if (outcome.reason === "budget_exhausted") {
    return budgetExhaustedResponse(ctx, {
      reason: outcome.budgetReason,
      surface: "programmatic",
      ...(outcome.provider === undefined ? {} : { provider: outcome.provider }),
    });
  }
  const common = {
    headers: ctx.headers,
    instance: ctx.instance,
    ...(details === undefined ? {} : { details }),
  };
  if (outcome.reason === "cost_limit_exceeded") {
    return errorResponse(
      "cost_limit_exceeded",
      "The estimated provider cost exceeds max_cost_cents.",
      422,
      {
        ...common,
        ...(outcome.estimatedCostCents === undefined
          ? {}
          : { problemDetails: { estimated_cost_cents: outcome.estimatedCostCents } }),
      },
    );
  }
  if (outcome.reason === "rate_limited") {
    return errorResponse("rate_limited", "Provider rate limit reached. Try again shortly.", 429, {
      ...common,
      headers: retryHeaders(ctx, outcome.resetAt, 1_000),
    });
  }
  return null;
}
