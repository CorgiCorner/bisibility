import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function findDeployIngestHook(tokenHash: string | null) {
  if (!tokenHash) return null;
  return prisma.ingestHook.findUnique({
    select: {
      disabled: true,
      id: true,
      label: true,
      project: { select: { id: true, publicId: true, writeMode: true } },
      projectId: true,
      publicId: true,
    },
    where: { tokenHash },
  });
}

export async function markDeployIngestHookUsed(hookId: string) {
  return prisma.ingestHook.update({ data: { lastUsedAt: new Date() }, where: { id: hookId } });
}
