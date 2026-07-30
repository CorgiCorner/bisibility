import "server-only";

import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { BUDGET_EXHAUSTED_CODE } from "./budget-contract";
import { positiveCostCents } from "./cost";

export const DEFAULT_MONTHLY_COST_CAP_CENTS = 5_000;
export { BUDGET_EXHAUSTED_CODE } from "./budget-contract";

type BudgetClient = Pick<typeof prisma, "project" | "providerCostEntry" | "rankCheck">;

type MonthlySpendOptions = {
  client?: BudgetClient;
  excludeRankCheckId?: string;
  estimatedCostCents?: unknown;
};

/**
 * Per-workspace monthly provider budget cap. Stored on the project row, seeded at
 * $50.00 on creation, and edited only in Settings > Provider usage.
 */
export async function projectBudgetCapCents(
  projectId: string,
  options: Pick<MonthlySpendOptions, "client"> = {},
) {
  const client = options.client ?? prisma;
  const project = await client.project.findUnique({
    select: { budgetCapCents: true },
    where: { id: projectId },
  });

  return project?.budgetCapCents ?? DEFAULT_MONTHLY_COST_CAP_CENTS;
}

export function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function nextMonthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function monthUtcRange(now = new Date()) {
  return {
    gte: monthStartUtc(now),
    lt: nextMonthStartUtc(now),
  };
}

export async function monthlySpendCents(
  projectId: string,
  now = new Date(),
  options: MonthlySpendOptions = {},
) {
  const client = options.client ?? prisma;
  const period = monthUtcRange(now);
  const rankChecks = await client.rankCheck.aggregate({
    _sum: { costCents: true, estimatedCostCents: true },
    where: {
      checkedAt: period,
      ...(options.excludeRankCheckId ? { id: { not: options.excludeRankCheckId } } : {}),
      keyword: { projectId },
      ...whereExecutedChecks(),
    },
  });
  const providerCosts = await client.providerCostEntry.aggregate({
    _sum: { costCents: true },
    where: { cached: false, createdAt: period, feature: { not: "rank_check" }, projectId },
  });

  return (
    Number(rankChecks._sum.costCents ?? 0) +
    Number(rankChecks._sum.estimatedCostCents ?? 0) +
    Number(providerCosts._sum.costCents ?? 0)
  );
}

export type ConnectionLookupSpend = {
  connectionId: string;
  costCents: number;
  entryCount: number;
  feature: "backlinks" | "keyword_metrics" | "keyword_research" | "ranked_keywords";
};

export async function monthlyLookupSpendByConnection(
  projectId: string,
  now = new Date(),
  options: Pick<MonthlySpendOptions, "client"> = {},
): Promise<ConnectionLookupSpend[]> {
  const client = options.client ?? prisma;
  const groups = await client.providerCostEntry.groupBy({
    _count: { _all: true },
    _sum: { costCents: true },
    by: ["connectionId", "feature"],
    where: {
      cached: false,
      createdAt: { gte: monthStartUtc(now), lt: nextMonthStartUtc(now) },
      feature: { not: "rank_check" },
      projectId,
    },
  });

  return groups.flatMap((group) =>
    group.feature === "rank_check"
      ? []
      : [
          {
            connectionId: group.connectionId,
            costCents: Number(group._sum.costCents ?? 0),
            entryCount: group._count._all,
            feature: group.feature,
          },
        ],
  );
}

export type BudgetState = {
  capCents: number;
  spentCents: number;
};

export class BudgetExhaustedError extends Error {
  readonly code = BUDGET_EXHAUSTED_CODE;
  readonly status = 429;

  constructor(readonly budget: BudgetState & { projectId: string }) {
    super("Rank check monthly budget reached.");
    this.name = "BudgetExhaustedError";
  }
}

export function isBudgetExhaustedError(error: unknown): error is BudgetExhaustedError {
  const value = error as { code?: unknown; name?: unknown };
  return (
    error instanceof BudgetExhaustedError ||
    value.code === BUDGET_EXHAUSTED_CODE ||
    value.name === "BudgetExhaustedError"
  );
}

type AssertBudgetOptions = MonthlySpendOptions & {
  /**
   * Precomputed cap from a project row the caller already loaded; when finite
   * it skips the per-call projectBudgetCapCents query.
   */
  capCents?: number;
};

export async function assertBudgetAvailable(
  projectId: string,
  now = new Date(),
  options: AssertBudgetOptions = {},
) {
  const capCents =
    options.capCents != null && Number.isFinite(options.capCents)
      ? options.capCents
      : await projectBudgetCapCents(projectId, options);
  const spentCents = await monthlySpendCents(projectId, now, options);
  const estimatedCostCents = positiveCostCents(options.estimatedCostCents);
  if (spentCents >= capCents || spentCents + estimatedCostCents > capCents) {
    throw new BudgetExhaustedError({ capCents, projectId, spentCents });
  }

  return { capCents, spentCents };
}
