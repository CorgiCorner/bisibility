import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { assertProviderAllocationAvailable } from "@/lib/provider-usage/enforcement";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { SerpDepth } from "@/lib/serp/markets";
import { estimatedRankCheckCostCents } from "./default-cost";
import type { DataForSeoQueuePriority } from "./queued-config";
import { dataForSeoQueuedEstimate, queuedBillingUnits } from "./queued-pricing";
import type { RankCheckConnectionInput } from "./runner";

export async function assertRankCheckConnectionAllocation(
  input: {
    connection: RankCheckConnectionInput;
    depth: SerpDepth;
    projectId: string;
  },
  db: Pick<PrismaClient, "project" | "providerConnection" | "providerCostEntry">,
) {
  if (!input.connection.id) return;
  const estimatedCostCents = estimatedRankCheckCostCents(
    input.connection.provider,
    input.depth,
    input.connection.costPerCheckCents,
    input.connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
  );
  await assertProviderAllocationAvailable(
    {
      catalog: PROVIDER_CATALOG,
      connectionId: input.connection.id,
      estimatedCostCents: estimatedCostCents ?? 0,
      estimatedUsageQuantity: pagesPerCheck(input.depth),
      projectId: input.projectId,
      provider: input.connection.provider,
      legacyBudgetCheck: async () => undefined,
    },
    db,
  );
}

export async function assertQueuedRankCheckBatchAllocation(
  input: {
    connection: { id: string };
    priority: DataForSeoQueuePriority;
    projectId: string;
    tasks: readonly { depth: SerpDepth }[];
  },
  db: Pick<
    PrismaClient | Prisma.TransactionClient,
    "project" | "providerConnection" | "providerCostEntry"
  >,
) {
  const estimatedCostCents = input.tasks.reduce(
    (sum, task) => sum + dataForSeoQueuedEstimate(input.priority, task.depth),
    0,
  );
  const estimatedUsageQuantity = input.tasks.reduce(
    (sum, task) => sum + queuedBillingUnits(task.depth),
    0,
  );
  await assertProviderAllocationAvailable(
    {
      catalog: PROVIDER_CATALOG,
      connectionId: input.connection.id,
      estimatedCostCents,
      estimatedUsageQuantity,
      projectId: input.projectId,
      provider: "dataforseo",
      legacyBudgetCheck: async () => undefined,
    },
    db,
  );
}
