import "server-only";
import { ApiInputError } from "@/lib/api/errors";
import { projectRunBudgetAmounts } from "@/lib/rank-check/runs/budget-presentation";
import type { RankCheckRunRow } from "./rank-check-run-dto";

export function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function statusCsv<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T[] | undefined {
  if (!value) return undefined;
  const values = value.split(",").map((item) => item.trim());
  if (values.some((item) => !allowed.includes(item as T))) {
    throw new ApiInputError("Status filter contains an unsupported value.");
  }
  return [...new Set(values)] as T[];
}

export async function budgetForRuns(rows: RankCheckRunRow[], spentCents: number | null) {
  const budget = rows.find((row) => row.blockedReason === "budget_exhausted");
  return budget && spentCents !== null
    ? await projectRunBudgetAmounts(budget.projectId, spentCents)
    : null;
}
