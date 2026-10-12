import type { Prisma } from "@/lib/generated/prisma/client";
import { BudgetExhaustedError } from "./admission-errors";
import { putSpendingBudget, readSpendingBudgets } from "./spending-limit-store";
import { projectSpendingBudget } from "./spending-limits";

export const DEFAULT_MONTHLY_COST_CAP_CENTS = 5_000;

/** Creation paths only: install a default Store cap without replacing settings. */
export async function ensureProjectSpendingBudget(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
  namespace: string,
  projectId: string,
) {
  const budgets = await readSpendingBudgets(tx, namespace, [
    { kind: "group", namespace, group: projectId },
  ]);
  if (budgets.some((b) => b.id === `project:${projectId}:monthly`)) return;
  await putSpendingBudget(
    tx,
    projectSpendingBudget(namespace, projectId, String(DEFAULT_MONTHLY_COST_CAP_CENTS), 1),
  );
}

/** Paid admission must never create or restore project spending authority. */
export async function requireProjectSpendingBudget(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
  namespace: string,
  projectId: string,
) {
  const budgets = await readSpendingBudgets(tx, namespace, [
    { kind: "group", namespace, group: projectId },
  ]);
  if (!budgets.some((budget) => budget.id === `project:${projectId}:monthly`))
    throw new BudgetExhaustedError({
      projectId,
      capCents: 0,
      spentCents: 0,
      reservedCents: 0,
      reason: "budget_missing",
      resetAt: null,
    });
}
