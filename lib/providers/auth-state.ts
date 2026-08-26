import "server-only";

import { prisma } from "@/lib/db/prisma";
import { projectLabel } from "@/lib/ops/labels";
import { notifyOps } from "@/lib/ops/notify";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";

export async function markProviderNeedsReauth(input: {
  connectionId: string;
  notifyOps?: boolean;
  projectId: string;
  provider: string;
}) {
  const transitioned = await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    const current = await tx.providerConnection.findUnique({
      where: { projectId_provider: { projectId: input.projectId, provider: input.provider } },
    });
    if (current?.id !== input.connectionId || current.status !== "connected") return { count: 0 };
    return tx.providerConnection.updateMany({
      data: { status: "needs_reauth" },
      where: { id: current.id, status: "connected" },
    });
  });
  if (transitioned.count === 0) return false;

  if (input.notifyOps !== false) {
    await notifyOps({
      fields: {
        Connection: input.connectionId,
        Project: projectLabel(input.projectId),
        Provider: input.provider,
      },
      kind: "provider_auth",
      severity: "error",
      title: "Provider authorization requires reconnection",
    }).catch(() => undefined);
  }
  return true;
}
