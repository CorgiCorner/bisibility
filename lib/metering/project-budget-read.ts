import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { positiveCostCents } from "@/lib/rank-check/cost";
import { formatQuantity } from "@usagekit/core";
import { BudgetExhaustedError } from "./admission-errors";
import { meteringNamespace } from "./runtime";
import { currentBudgets, status } from "./store/budgets";
import { createSql } from "./store/sql";

type BudgetClient = Pick<Prisma.TransactionClient, "$queryRaw">;
async function readProjectBudgets(projectId: string, client: BudgetClient) {
  const namespace = meteringNamespace();
  const sql = createSql(client as Prisma.TransactionClient, {
    statements: 0,
    changes: 0n,
    rowsRead: 0,
  });
  const budgets = await currentBudgets(sql, namespace, [
    { kind: "group", namespace, group: projectId },
  ]);
  return { sql, budgets };
}

/** Reads the Store definition and outstanding reservations without changing accounting. */
export async function projectBudgetStatus(projectId: string, now = new Date()) {
  const { sql, budgets } = await readProjectBudgets(projectId, prisma);
  const budget = budgets.find((row) => row.id === `project:${projectId}:monthly`);
  if (!budget) return null;
  const uncertain = budgets.some(
    (row) => row.unit === "paid_attempts" && row.onExceed === "block" && row.limit?.value === 0n,
  );
  return { ...(await status(sql, budget, now)), uncertain };
}
export async function projectBudgetCapCents(projectId: string) {
  const current = await projectBudgetStatus(projectId);
  return current?.budget.limit ? Number(formatQuantity(current.budget.limit)) : 0;
}

export type BudgetState = {
  capCents: number;
  reservedCents?: number;
  /** Charged value for admission, distinct from provider-cost reporting. */
  spentCents: number;
  valuationIncomplete?: boolean;
};

export async function assertBudgetAvailable(
  projectId: string,
  now = new Date(),
  options: { client?: BudgetClient; estimatedCostCents?: unknown } = {},
) {
  const { sql, budgets } = await readProjectBudgets(projectId, options.client ?? prisma);
  const projectBudget = budgets.find((b) => b.id === `project:${projectId}:monthly`);
  const state: BudgetState = { capCents: 0, spentCents: 0, reservedCents: 0 };
  if (!projectBudget)
    throw new BudgetExhaustedError({
      ...state,
      projectId,
      reason: "budget_missing",
      resetAt: null,
    });
  // Populate totals before any constraint can deny, retaining the existing denial order.
  const projectStatus = await status(sql, projectBudget, now);
  const amount = (q: { value: bigint; scale: number } | null) =>
    q ? Number(q.value) / 10 ** q.scale : 0;
  Object.assign(state, {
    capCents: amount(projectBudget.limit),
    spentCents: amount(projectStatus.used),
    reservedCents: amount(projectStatus.reserved),
  });
  for (const budget of budgets) {
    const current = budget === projectBudget ? projectStatus : await status(sql, budget, now);
    const estimate =
      budget.unit === "paid_attempts" ? 1 : positiveCostCents(options.estimatedCostCents);
    if (
      budget.onExceed === "block" &&
      current.remaining !== null &&
      estimate > amount(current.remaining)
    )
      throw new BudgetExhaustedError({
        ...state,
        projectId,
        valuationIncomplete: budget.unit === "paid_attempts",
        resetAt: current.epoch.endsAt ? new Date(current.epoch.endsAt) : null,
      });
  }
  return state;
}
