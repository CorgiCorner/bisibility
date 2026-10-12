import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";

export { DEFAULT_MONTHLY_COST_CAP_CENTS } from "@/lib/metering/project-budget-bootstrap";
export { BUDGET_EXHAUSTED_CODE } from "./budget-contract";

type BudgetClient = Pick<typeof prisma, "project" | "$queryRaw">;

type MonthlySpendOptions = {
  client?: BudgetClient;
  excludeRankCheckId?: string;
  estimatedCostCents?: unknown;
};

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

/** Provider cost reporting reads effective canonical Store receipts. */
export async function monthlySpendCents(
  projectId: string,
  now = new Date(),
  options: MonthlySpendOptions = {},
) {
  const client = options.client ?? prisma;
  const range = monthUtcRange(now);
  const [row] = await client.$queryRaw<{ total: unknown }[]>(Prisma.sql`
    SELECT COALESCE(SUM("costCents"),0) AS total FROM (${canonicalUsageSql()}) u
    WHERE "projectId"=${projectId} AND "createdAt">=${range.gte} AND "createdAt"<${range.lt} AND NOT cached`);
  return Number(row?.total ?? 0);
}

export type ConnectionLookupSpend = {
  connectionId: string;
  costCents: number;
  entryCount: number;
  feature:
    | "ai_tracking"
    | "ai_visibility"
    | "prompt_explorer"
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
  const range = monthUtcRange(now);
  return client.$queryRaw<ConnectionLookupSpend[]>(Prisma.sql`
    SELECT "connectionId",feature,COALESCE(SUM("costCents"),0)::float8 AS "costCents",COUNT(*)::int AS "entryCount"
    FROM (${canonicalUsageSql()}) u WHERE "projectId"=${projectId} AND "createdAt">=${range.gte}
      AND "createdAt"<${range.lt} AND NOT cached AND feature<>'rank_check' AND "measurementStatus"='recorded'
    GROUP BY "connectionId",feature`);
}

export { BudgetExhaustedError, isBudgetExhaustedError } from "@/lib/metering/admission-errors";
export { assertBudgetAvailable } from "@/lib/metering/project-budget-read";
