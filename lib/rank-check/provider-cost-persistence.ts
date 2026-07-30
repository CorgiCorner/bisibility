import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";

export async function writeRankCheckProviderCostEntry(
  tx: Prisma.TransactionClient,
  input: {
    connectionId?: string;
    costCents?: number;
    failed: boolean;
    projectId?: string;
  },
) {
  if (!input.connectionId || !input.projectId || !input.costCents || input.costCents <= 0) {
    return;
  }
  await tx.providerCostEntry.create({
    data: {
      cached: false,
      connectionId: input.connectionId,
      costCents: input.costCents,
      failed: input.failed,
      feature: "rank_check",
      projectId: input.projectId,
    },
  });
}
