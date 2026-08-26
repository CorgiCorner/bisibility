import "server-only";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { catalogEntry } from "@/lib/provider-allocations/validation";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { aggregateConnectionUsage } from "./connection-usage";

type DbClient = PrismaClient | Prisma.TransactionClient;
type EnforcementClient = {
  project: Pick<DbClient["project"], "findUnique">;
  providerConnection: Pick<DbClient["providerConnection"], "findFirst">;
  providerCostEntry: Pick<DbClient["providerCostEntry"], "aggregate" | "count">;
};
export class ProviderAllocationExhaustedError extends Error {
  constructor(readonly connectionId: string) {
    super("Provider connection monthly allocation reached.");
    this.name = "ProviderAllocationExhaustedError";
  }
}

type Input = {
  catalog: readonly ProviderCatalogEntry[];
  connectionId: string;
  estimatedCostCents: number;
  estimatedUsageQuantity?: number;
  legacyBudgetCheck?: (capCents: number, estimate: number) => Promise<void>;
  now?: Date;
  projectId: string;
  provider: string;
};

function estimate(value: number | undefined, fallback: number) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < 0)
    throw new RangeError("Provider usage estimate is invalid.");
  return result;
}

export async function assertProviderAllocationAvailable(input: Input, db: EnforcementClient) {
  const project = await db.project.findUnique({
    select: { budgetCapCents: true, providerAllocationsInitializedAt: true },
    where: { id: input.projectId },
  });
  if (!project) throw new Error("Project not found.");
  if (!project.providerAllocationsInitializedAt) {
    await input.legacyBudgetCheck?.(project.budgetCapCents, input.estimatedCostCents);
    return { mode: "legacy" as const, remaining: project.budgetCapCents };
  }
  const connection = await db.providerConnection.findFirst({
    select: { allocationAmountPerMonth: true, allocationUnit: true },
    where: { id: input.connectionId, projectId: input.projectId, provider: input.provider },
  });
  if (!connection) throw new Error("Provider connection not found.");
  if (!connection.allocationUnit || !connection.allocationAmountPerMonth)
    return { mode: "allocation" as const, remaining: null };
  const metadata = catalogEntry(input.catalog, input.provider).allocation;
  if (metadata.kind !== "billable" || metadata.allocationUnit !== connection.allocationUnit)
    throw new TypeError("Stored allocation does not match provider metadata.");
  const { used } = await aggregateConnectionUsage(db, {
    connectionId: input.connectionId,
    now: input.now,
    projectId: input.projectId,
    unit: connection.allocationUnit,
  });
  const projected =
    used +
    (connection.allocationUnit === "cents"
      ? estimate(input.estimatedCostCents, 0)
      : estimate(input.estimatedUsageQuantity, 1));
  if (
    used >= connection.allocationAmountPerMonth ||
    projected > connection.allocationAmountPerMonth
  )
    throw new ProviderAllocationExhaustedError(input.connectionId);
  return { mode: "allocation" as const, remaining: connection.allocationAmountPerMonth - used };
}
