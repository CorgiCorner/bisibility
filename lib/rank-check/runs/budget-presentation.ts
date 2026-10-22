import "server-only";
import { rankCheckBudgetStatus } from "@/lib/metering/rank-check-budget-read";
import { formatQuantity } from "@usagekit/core";

/** A missing, unlimited or uncertain budget must not become a displayed zero-dollar cap. */
export async function projectRunBudgetAmounts(projectId: string, spentCents: number) {
  const current = await rankCheckBudgetStatus(projectId);
  if (!current?.budget.limit || current.uncertain) return null;
  return { capCents: Number(formatQuantity(current.budget.limit)), spentCents };
}
