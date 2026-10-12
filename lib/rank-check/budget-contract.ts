export const BUDGET_EXHAUSTED_CODE = "budget_exhausted";

export type BudgetExhaustedResult = {
  code: typeof BUDGET_EXHAUSTED_CODE | "budget_missing" | "usage_reconciliation_required";
  message: string;
  status: "not_started";
};

export function budgetExhaustedResult(message: string, missing = false): BudgetExhaustedResult {
  return {
    code: missing ? "budget_missing" : BUDGET_EXHAUSTED_CODE,
    message,
    status: "not_started",
  };
}

export function hasMonthlyBudgetCap(capCents: number) {
  return capCents > 0;
}

export function monthlyBudgetExhausted(capCents: number, spentCents: number) {
  return hasMonthlyBudgetCap(capCents) && spentCents >= capCents;
}

export function isBudgetExhaustedResult(value: unknown): value is BudgetExhaustedResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<BudgetExhaustedResult>;
  return (
    (result.code === BUDGET_EXHAUSTED_CODE ||
      result.code === "budget_missing" ||
      result.code === "usage_reconciliation_required") &&
    typeof result.message === "string" &&
    result.status === "not_started"
  );
}
