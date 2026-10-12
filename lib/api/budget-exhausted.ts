import "server-only";

import {
  type BudgetDenialReason,
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "@/lib/metering/budget-denial";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { nextMonthStartUtc } from "@/lib/rank-check/budget";
import type { ApiContext } from "./context";
import { errorResponse } from "./responses";

const budgetPeriodLabel = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

export function budgetExhaustedResponse(
  ctx: Pick<ApiContext, "headers" | "instance">,
  input: {
    connection?: string;
    reason?: BudgetDenialReason;
    detail?: string;
    now?: Date;
    resetAt?: Date | null;
    provider?: string;
    scope?: "wallet" | "connection";
    surface: ProviderRequestSurface;
  },
): Response {
  const now = input.now ?? new Date();
  const missing = input.reason === "budget_missing";
  const unresolved = input.reason === "usage_reconciliation_required";
  const resetsAt =
    missing || unresolved
      ? null
      : input.resetAt === undefined
        ? nextMonthStartUtc(now)
        : input.resetAt;
  const headers = new Headers(ctx.headers);
  headers.delete("Retry-After");
  headers.delete("RateLimit-Reset");
  if (resetsAt) {
    const retryAfter = String(Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 1_000)));
    headers.set("Retry-After", retryAfter);
    headers.set("RateLimit-Reset", retryAfter);
  }
  return errorResponse(
    "budget_exhausted",
    missing
      ? MISSING_PROJECT_BUDGET_MESSAGE
      : unresolved
        ? UNRESOLVED_USAGE_MESSAGE
        : (input.detail ?? defaultDetail(now, input)),
    429,
    {
      headers,
      instance: ctx.instance,
      problemDetails: {
        surface: input.surface,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.scope ? { scope: input.scope } : {}),
        ...(resetsAt ? { resets_at: resetsAt.toISOString() } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.connection ? { connection: input.connection } : {}),
      },
    },
  );
}

function defaultDetail(
  now: Date,
  input: { provider?: string; surface: ProviderRequestSurface },
): string {
  const surfaceLabel =
    input.surface === "app" ? "App and schedules budget" : "API, MCP and SDK budget";
  return `${surfaceLabel}${input.provider ? ` for ${input.provider}` : ""} reached for ${budgetPeriodLabel.format(now)}.`;
}
