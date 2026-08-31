import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export const USER_PAUSE_REASON = "user";

export async function isImportUserPaused(
  importId: string,
  client: Pick<Prisma.TransactionClient, "searchAnalyticsImport"> = prisma,
) {
  const row = await client.searchAnalyticsImport.findUnique({
    select: { pausedReason: true },
    where: { id: importId },
  });
  return row?.pausedReason === USER_PAUSE_REASON;
}

export function userPauseGuard(importId: string) {
  return {
    id: importId,
    OR: [{ pausedReason: null }, { pausedReason: { not: USER_PAUSE_REASON } }],
  };
}

export async function isProjectGscUserPaused(projectId: string) {
  return Boolean(
    await prisma.searchAnalyticsImport.findFirst({
      select: { id: true },
      where: { projectId, pausedReason: USER_PAUSE_REASON, source: "gsc" },
    }),
  );
}
