/** A missing cap needs configuration, not usage reconciliation or a monthly reset. */
export type BudgetDenialReason = "budget_missing" | "usage_reconciliation_required";

export function isMissingProjectBudget(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const error = value as { budget?: { reason?: unknown }; budgetReason?: unknown };
  return error.budget?.reason === "budget_missing" || error.budgetReason === "budget_missing";
}

export const MISSING_PROJECT_BUDGET_MESSAGE =
  "Project spending budget is missing. Ask the project owner to configure a monthly budget in Settings > Usage.";

export const UNRESOLVED_USAGE_MESSAGE =
  "Provider usage is not fully confirmed. Reconcile the retained usage evidence before retrying.";

export function budgetDenialReason(value: unknown): BudgetDenialReason | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = value as {
    budget?: { reason?: BudgetDenialReason; valuationIncomplete?: boolean };
    budgetReason?: BudgetDenialReason;
  };
  return (
    error.budget?.reason ??
    error.budgetReason ??
    (error.budget?.valuationIncomplete ? "usage_reconciliation_required" : undefined)
  );
}
