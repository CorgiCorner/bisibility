import "server-only";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";
import { monthUtcRange } from "@/lib/rank-check/budget";

type ConnectionUsageClient = {
  providerCostEntry: Pick<PrismaClient["providerCostEntry"], "aggregate" | "count">;
};

function number(value: unknown) {
  return Number(value ?? 0);
}

export async function aggregateConnectionUsage(
  db: ConnectionUsageClient,
  input: {
    connectionId: string;
    now?: Date;
    projectId: string;
    unit: ProviderAllocationUnit;
  },
) {
  const where = {
    cached: false,
    connectionId: input.connectionId,
    createdAt: monthUtcRange(input.now),
    projectId: input.projectId,
  };
  const [aggregate, legacyUnitRows] = await Promise.all([
    db.providerCostEntry.aggregate({
      _count: { _all: true },
      _sum: { costCents: true, usageQuantity: true },
      where,
    }),
    input.unit === "units"
      ? db.providerCostEntry.count({ where: { ...where, usageQuantity: null } })
      : Promise.resolve(0),
  ]);

  return {
    requestCount: aggregate._count._all,
    used:
      input.unit === "cents"
        ? number(aggregate._sum.costCents)
        : number(aggregate._sum.usageQuantity) + legacyUnitRows,
  };
}
