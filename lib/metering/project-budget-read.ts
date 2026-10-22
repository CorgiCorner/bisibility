import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { positiveCostCents } from "@/lib/rank-check/cost";
import { formatQuantity } from "@usagekit/core";
import { BudgetExhaustedError } from "./admission-errors";
import {
  type ProjectFunding,
  parseProjectFundingBudgetId,
  projectBudgetId,
  projectFundingBudgetScopes,
  selectProjectLimit,
} from "./project-funding-budgets";
import { meteringNamespace } from "./runtime";
import { currentBudgets, status } from "./store/budgets";
import { createSql } from "./store/host-sql";

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
    ...projectFundingBudgetScopes(namespace, projectId),
  ]);
  return { sql, budgets };
}
/** The group budget proves the project exists; a split project limits each funding source. */
function projectLimit(
  budgets: Awaited<ReturnType<typeof readProjectBudgets>>["budgets"],
  projectId: string,
  funding: ProjectFunding,
) {
  if (!budgets.some((row) => row.id === projectBudgetId(projectId))) return null;
  return selectProjectLimit(budgets, projectId, funding).budget;
}

/** Reads the Store definition and outstanding reservations without changing accounting. */
export async function projectBudgetStatus(
  projectId: string,
  now = new Date(),
  funding: ProjectFunding = "byok",
) {
  const { sql, budgets } = await readProjectBudgets(projectId, prisma);
  const budget = projectLimit(budgets, projectId, funding);
  if (!budget) return null;
  const uncertain = budgets.some(
    (row) => row.unit === "paid_attempts" && row.onExceed === "block" && row.limit?.value === 0n,
  );
  return { ...(await status(sql, budget, now)), uncertain };
}
/**
 * Project funding limits as the project's own readers see them. Meter redacts tag budgets for
 * non-administrators, but these tags belong to one project, like its group cap.
 */
export async function projectFundingStatuses(projectId: string, now = new Date()) {
  const { sql, budgets } = await readProjectBudgets(projectId, prisma);
  return Promise.all(
    budgets
      .filter((budget) => parseProjectFundingBudgetId(budget.id)?.projectId === projectId)
      .map((budget) => status(sql, budget, now)),
  );
}
export async function projectBudgetCapCents(projectId: string, funding: ProjectFunding = "byok") {
  const current = await projectBudgetStatus(projectId, new Date(), funding);
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
  options: {
    client?: BudgetClient;
    estimatedCostCents?: unknown;
    /** Customer charge. Credits budgets compare this, not the provider cost. */
    estimatedCustomerCents?: unknown;
    funding?: ProjectFunding;
  } = {},
) {
  const funding = options.funding ?? "byok";
  const { sql, budgets: all } = await readProjectBudgets(projectId, options.client ?? prisma);
  const projectBudget = projectLimit(all, projectId, funding);
  // The other source's limit never denies this work.
  const budgets = all.filter((b) => b === projectBudget || !parseProjectFundingBudgetId(b.id));
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
      budget.unit === "paid_attempts"
        ? 1
        : budget.unit === "customer_cents" && options.estimatedCustomerCents !== undefined
          ? positiveCostCents(options.estimatedCustomerCents)
          : positiveCostCents(options.estimatedCostCents);
    if (
      budget.onExceed === "block" &&
      current.remaining !== null &&
      estimate > amount(current.remaining)
    )
      throw new BudgetExhaustedError({
        ...state,
        projectId,
        ...(parseProjectFundingBudgetId(budget.id) ? { fundingSource: funding } : {}),
        valuationIncomplete: budget.unit === "paid_attempts",
        resetAt: current.epoch.endsAt ? new Date(current.epoch.endsAt) : null,
      });
  }
  return state;
}
