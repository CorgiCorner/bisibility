import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProviderUsage } from "@/lib/provider-usage/tag";

export async function writeRankCheckProviderCostEntry(
  tx: Prisma.TransactionClient,
  input: {
    connectionId?: string;
    costCents?: number;
    failed: boolean;
    keywordId?: string;
    provider: string;
    providerRequestId?: string;
    projectId?: string;
    usage?: ProviderUsage;
  },
) {
  if (!input.connectionId || !input.projectId || !input.costCents || input.costCents <= 0) {
    return;
  }
  if (!input.usage) {
    console.warn("Provider cost entry is missing its provider tag context.", {
      feature: "rank_check",
      projectId: input.projectId,
    });
  }
  await tx.providerCostEntry.create({
    data: {
      cached: false,
      connectionId: input.connectionId,
      costCents: input.costCents,
      failed: input.failed,
      feature: "rank_check",
      keywordId: input.keywordId,
      provider: input.provider,
      ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
      projectId: input.projectId,
      ...(input.usage
        ? {
            correlationId: input.usage.correlationId,
            source: input.usage.source,
            tag: input.usage.tag,
            trigger: input.usage.trigger,
          }
        : {}),
    },
  });
}
