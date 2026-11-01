import "server-only";
import { prisma } from "@/lib/db/prisma";
import { selectConnectionRecovery } from "@/lib/integrations/provider-recovery/selector";
import type { RunAccountBlock } from "@/lib/integrations/provider-recovery/types";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";

export async function rankRunAccountBlocks(projectId: string, checkIds: readonly string[]) {
  const result = new Map<string, RunAccountBlock[]>();
  if (!checkIds.length) return result;
  const rows = await prisma.providerBlockedAttempt.findMany({
    where: {
      rankCheckId: { in: [...checkIds] },
      reason: "account_blocked",
      connection: { projectId },
    },
    select: {
      rankCheckId: true,
      connection: { select: { publicId: true, provider: true } },
      incident: { select: { reason: true, scope: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    const view = selectConnectionRecovery({
      accountState: null,
      incidents: [row.incident ?? { reason: "legacy_unverified", scope: { kind: "account" } }],
      unconfirmedRequests: 0,
      probeId: null,
      probeAvailable: false,
      nextCheckAt: null,
    });
    if (!view.reason) continue;
    const blocks = result.get(row.rankCheckId) ?? [];
    if (
      !blocks.some(
        (block) => block.connectionId === row.connection.publicId && block.reason === view.reason,
      )
    ) {
      blocks.push({
        connectionId: row.connection.publicId,
        provider:
          PROVIDER_CATALOG.find((provider) => provider.id === row.connection.provider)?.label ??
          row.connection.provider,
        reason: view.reason,
      });
    }
    result.set(row.rankCheckId, blocks);
  }
  return result;
}
