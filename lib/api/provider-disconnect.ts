import "server-only";
import { prisma } from "@/lib/db/prisma";
import { guardConnectionFundingMutation } from "@/lib/metering/budget-mirror";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderConnectionRefInput } from "@/lib/schemas/provider";
import { auditConnection, auditProviderMutation } from "./provider-audit";
import { requireApiPublicId } from "./public-id";

export async function disconnectProviderConnection(
  input: ProviderConnectionRefInput,
  context: { actorId: string | null; projectId: string },
) {
  const item = PROVIDER_CATALOG.find((provider) => provider.id === input.providerId);
  if (!item) throw new Error(`Unknown provider: ${input.providerId}`);
  const removed = await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, context.projectId);
    const before = await tx.providerConnection.findUnique({
      where: { projectId_provider: { projectId: context.projectId, provider: item.id } },
    });
    if (!before) return false;
    await guardConnectionFundingMutation(tx, before.id);
    await tx.providerConnection.delete({ where: { id: before.id } });
    await auditProviderMutation(
      {
        action: "provider.disconnect",
        actorId: context.actorId,
        after: { provider: item.id, status: "removed" },
        before: auditConnection(before),
        projectId: context.projectId,
        targetId: requireApiPublicId(before.publicId ?? "", "conn"),
      },
      tx,
    );
    return true;
  });
  return removed ? { ok: true } : null;
}
