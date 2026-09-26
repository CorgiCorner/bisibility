import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  BUDGET_EXHAUSTED_CODE,
  hasMonthlyBudgetCap,
  monthlyBudgetExhausted,
} from "./budget-contract";
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

export function nextMonthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function monthUtcRange(now = new Date()) {
  return {
    gte: monthStartUtc(now),
    lt: nextMonthStartUtc(now),
  };
}

/**
 * Confirmed provider spend for the current UTC month, across every feature.
 * Canonical source is the provider cost ledger: rows whose measurement
 * settled ("recorded"). Rank-check manual/estimated costs and in-flight
 * reservations never appear here; reservations stay separate in
 * assertBudgetAvailable.
 */
export async function monthlySpendCents(
  projectId: string,
  now = new Date(),
  options: MonthlySpendOptions = {},
) {
  const client = options.client ?? prisma;
  const providerCosts = await client.providerCostEntry.aggregate({
    _sum: { costCents: true },
    where: {
      cached: false,
      createdAt: monthUtcRange(now),
      measurementStatus: "recorded",
      projectId,
    },
  });

  return Number(providerCosts._sum.costCents ?? 0);
}

/** Charged amount for cap enforcement; provider-cost reporting stays separate. */
async function monthlyBudgetValuation(projectId: string, now: Date, client: BudgetClient) {
  const groups = await client.providerCostEntry.groupBy({
    _count: { _all: true, priceCents: true },
    _sum: { costCents: true, priceCents: true },
    by: ["credentialSource"],
    where: {
      cached: false,
      createdAt: monthUtcRange(now),
      measurementStatus: "recorded",
      projectId,
    },
  });

  let spentCents = 0;
  let valuationIncomplete = false;
  for (const group of groups) {
    if (group.credentialSource === "hosted") {
      spentCents += Number(group._sum.priceCents ?? 0);
      valuationIncomplete ||= group._count.priceCents !== group._count._all;
    } else {
      spentCents += Number(group._sum.costCents ?? 0);
    }
  }
  return { spentCents, valuationIncomplete };
}

export type ConnectionLookupSpend = {
  connectionId: string;
  costCents: number;
  entryCount: number;
  feature:
    | "backlinks"
    | "domain_overview"
    | "keyword_metrics"
    | "keyword_research"
    | "ranked_keywords";
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
      measurementStatus: "recorded",
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
  reservedCents?: number;
  /** Charged value for admission, distinct from provider-cost reporting. */
  spentCents: number;
  valuationIncomplete?: boolean;
};

export class BudgetExhaustedError extends Error {
  readonly code = BUDGET_EXHAUSTED_CODE;
  readonly status = 429;

  constructor(readonly budget: BudgetState & { projectId: string }) {
    super(
      budget.valuationIncomplete
        ? "Rank check monthly budget valuation unavailable."
        : "Rank check monthly budget reached.",
    );
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
  const client = options.client ?? prisma;
  const [valuation, reservations] = await Promise.all([
    monthlyBudgetValuation(projectId, now, client),
    client.rankCheck.aggregate({
      _sum: { estimatedCostCents: true },
      where: {
        checkedAt: monthUtcRange(now),
        ...(options.excludeRankCheckId ? { id: { not: options.excludeRankCheckId } } : {}),
        keyword: { projectId },
        status: "running",
      },
    }),
  ]);
  const { spentCents, valuationIncomplete } = valuation;
  const reservedCents = Number(reservations._sum.estimatedCostCents ?? 0);
  const state: BudgetState = {
    capCents,
    spentCents,
    ...(reservedCents > 0 ? { reservedCents } : {}),
    ...(valuationIncomplete ? { valuationIncomplete } : {}),
  };
  const committedCents = spentCents + reservedCents;
  const estimatedCostCents = positiveCostCents(options.estimatedCostCents);
  if (
    (valuationIncomplete && hasMonthlyBudgetCap(capCents)) ||
    monthlyBudgetExhausted(capCents, committedCents) ||
    (hasMonthlyBudgetCap(capCents) && committedCents + estimatedCostCents > capCents)
  ) {
    throw new BudgetExhaustedError({ ...state, projectId });
  }

  return state;
}
