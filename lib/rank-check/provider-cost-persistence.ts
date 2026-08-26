import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { recordProviderUsage } from "@/lib/provider-usage/recorder";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";

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
    usage?: ProviderRequestAttribution;
    usageQuantity?: number | null;
  },
) {
  const costCents = input.costCents ?? 0;
  const usageQuantity = input.usageQuantity ?? 0;
  if (!input.connectionId || !input.projectId || (costCents <= 0 && usageQuantity <= 0)) return;
  if (!input.usage) {
    console.warn("Provider cost entry is missing its provider tag context.", {
      feature: "rank_check",
      projectId: input.projectId,
    });
    await tx.providerCostEntry.createMany({
      data: [
        {
          cached: false,
          connectionId: input.connectionId,
          costCents,
          failed: input.failed,
          feature: "rank_check",
          keywordId: input.keywordId,
          provider: input.provider,
          providerRequestId: input.providerRequestId,
          projectId: input.projectId,
          usageQuantity: input.usageQuantity ?? undefined,
        },
      ],
      skipDuplicates: true,
    });
    return;
  }
  await recordProviderUsage(tx, {
    attribution: input.usage,
    connectionId: input.connectionId,
    costCents,
    failed: input.failed,
    keywordId: input.keywordId,
    projectId: input.projectId,
    provider: input.provider,
    providerRequestId: input.providerRequestId,
    usageQuantity: input.usageQuantity,
  });
}
