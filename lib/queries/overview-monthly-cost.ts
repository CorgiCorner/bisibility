import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { monthStartUtc } from "@/lib/metering/utc-window";
import { ledgerActualCostCents, rankCheckLedgerActuals } from "./rank-check-run-accounting";

export async function readOverviewMonthlyCost(
  projectId: string,
  keyword: Prisma.KeywordWhereInput,
  now: Date,
  db: Prisma.TransactionClient,
  frozen = false,
) {
  const checks = await db.rankCheck.findMany({
    select: { id: true, status: true },
    where: {
      checkedAt: {
        gte: monthStartUtc(now),
        lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
        ...(frozen ? { lte: now } : {}),
      },
      ...(frozen ? { createdAt: { lte: now } } : {}),
      keyword,
    },
  });
  const actuals = await rankCheckLedgerActuals(
    projectId,
    checks.map(({ id }) => id),
    db,
  );
  const providerCostCents = checks.reduce<number | null>((sum, check) => {
    const cost = ledgerActualCostCents(actuals.get(check.id), null);
    return sum === null || cost === null ? null : sum + cost;
  }, 0);
  return {
    checksThisMonth: checks.filter(({ status }) => status === "completed").length,
    providerCostCents,
  };
}
