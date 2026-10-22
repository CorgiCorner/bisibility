import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { BUDGET_EXHAUSTED_CODE } from "@/lib/rank-check/budget-contract";
import {
  type BudgetDenialReason,
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "./budget-denial";
import type { PaidAttemptAdmissionError } from "./paid-attempt-types";
import { type ProjectFunding, parseProjectFundingBudgetId } from "./project-funding-budgets";

export class BudgetExhaustedError extends Error {
  readonly code = BUDGET_EXHAUSTED_CODE;
  readonly status = 429;

  constructor(
    readonly budget: {
      projectId: string;
      capCents: number;
      spentCents: number;
      reservedCents?: number;
      valuationIncomplete?: boolean;
      reason?: BudgetDenialReason;
      resetAt?: Date | null;
      /** Set when a split project denies one funding source; absent for the shared cap. */
      fundingSource?: ProjectFunding;
    },
  ) {
    super(
      budget.reason === "budget_missing"
        ? MISSING_PROJECT_BUDGET_MESSAGE
        : budget.valuationIncomplete || budget.reason === "usage_reconciliation_required"
          ? UNRESOLVED_USAGE_MESSAGE
          : budget.fundingSource === "platform"
            ? "Project Credits limit reached."
            : "Rank check monthly budget reached.",
    );
    if (budget.valuationIncomplete) budget.reason = "usage_reconciliation_required";
    this.name = "BudgetExhaustedError";
  }
}

export function isBudgetExhaustedError(error: unknown): error is BudgetExhaustedError {
  const value = error as { code?: unknown; name?: unknown } | null;
  return (
    error instanceof BudgetExhaustedError ||
    value?.code === BUDGET_EXHAUSTED_CODE ||
    value?.name === "BudgetExhaustedError"
  );
}

export class ProviderAllocationExhaustedError extends Error {
  readonly reason = "budget";
  readonly code = "provider_allocation_exhausted";
  constructor(
    readonly connectionId: string,
    readonly surface: ProviderRequestSurface,
    readonly resetAt?: Date | null,
    readonly budgetReason?: BudgetDenialReason,
  ) {
    super(
      budgetReason === "usage_reconciliation_required"
        ? UNRESOLVED_USAGE_MESSAGE
        : `Provider connection monthly allocation reached for the ${surface} surface.`,
    );
    this.name = "ProviderAllocationExhaustedError";
  }
}
const amount = (q: { value: bigint; scale: number } | null | undefined) =>
  q ? Number(q.value) / 10 ** q.scale : 0;
export function translatePaidAdmission(
  error: PaidAttemptAdmissionError,
  context?: { surface: ProviderRequestSurface; connectionId: string; projectId: string },
): Error {
  const result = error.outcome;
  if (result.outcome !== "exceeded") return error;
  context = error.context ?? context;
  const { budget, used, reserved, resetsAt } = result.exceeded;
  const uncertain = budget.unit === "paid_attempts";
  const resetAt = uncertain ? null : resetsAt ? new Date(resetsAt) : null;
  const funding = parseProjectFundingBudgetId(budget.id);
  const projectId =
    budget.scope.kind === "group"
      ? budget.scope.group
      : budget.scope.kind === "principal"
        ? context?.projectId
        : budget.scope.kind === "tag"
          ? funding?.projectId
          : undefined;
  if (projectId)
    return new BudgetExhaustedError({
      projectId,
      ...(funding ? { fundingSource: funding.fundingSource } : {}),
      capCents: amount(budget.limit),
      spentCents: amount(used),
      reservedCents: amount(reserved),
      valuationIncomplete: uncertain,
      resetAt,
    });
  return new ProviderAllocationExhaustedError(
    context?.connectionId ??
      (budget.scope.kind === "connection" ? budget.scope.connection : budget.id),
    context?.surface ?? (budget.surface === "programmatic" ? "programmatic" : "app"),
    resetAt,
    uncertain ? "usage_reconciliation_required" : undefined,
  );
}
