import "server-only";

import { prisma } from "@/lib/db/prisma";
import { projectLabel } from "@/lib/ops/labels";
import { notifyOps } from "@/lib/ops/notify";

export async function markProviderNeedsReauth(input: {
  connectionId: string;
  projectId: string;
  provider: string;
}) {
  const transitioned = await prisma.providerConnection.updateMany({
    data: { status: "needs_reauth" },
    where: { id: input.connectionId, status: "connected" },
  });
  if (transitioned.count === 0) return false;

  await notifyOps({
    fields: {
      Connection: input.connectionId,
      Project: projectLabel(input.projectId),
      Provider: input.provider,
    },
    kind: "provider_auth",
    severity: "error",
    title: "Google authorization requires reconnection",
  }).catch(() => undefined);
  return true;
}
