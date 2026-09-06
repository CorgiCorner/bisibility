import "server-only";

import { prisma } from "@/lib/db/prisma";
import { aggregateConnectionUsage } from "@/lib/provider-usage/connection-usage";
import type { ProviderCatalogEntry } from "@/lib/providers/types";

type ProviderSpendUsage = {
  current: Awaited<ReturnType<typeof aggregateConnectionUsage>>;
  previous: Awaited<ReturnType<typeof aggregateConnectionUsage>>;
};

export async function loadProviderSpendUsage(input: {
  catalog: readonly ProviderCatalogEntry[];
  connections: readonly { id: string; provider: string }[];
  now: Date;
  projectId: string;
}): Promise<Map<string, ProviderSpendUsage | null>> {
  const priorMonth = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() - 1, 1));
  return new Map(
    await Promise.all(
      input.connections.map(async (connection) => {
        const allocation = input.catalog.find(
          (entry) => entry.id === connection.provider,
        )?.allocation;
        if (allocation?.kind !== "billable") return [connection.id, null] as const;
        const [current, previous] = await Promise.all([
          aggregateConnectionUsage(prisma, {
            connectionId: connection.id,
            now: input.now,
            projectId: input.projectId,
            unit: allocation.allocationUnit,
          }),
          aggregateConnectionUsage(prisma, {
            connectionId: connection.id,
            now: priorMonth,
            projectId: input.projectId,
            unit: allocation.allocationUnit,
          }),
        ]);
        return [connection.id, { current, previous }] as const;
      }),
    ),
  );
}
