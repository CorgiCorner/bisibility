import "server-only";

import { prisma } from "@/lib/db/prisma";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";

/** Read-only context for the rank-planning explanation; no provider or cost lookup. */
export async function hasEnabledKeywordSchedule(projectId: string) {
  const locations = await activeMarketLocationIds(projectId, prisma);
  const schedule = await prisma.checkSchedule.findFirst({
    select: { id: true },
    where: {
      projectId,
      archivedAt: null,
      enabled: true,
      frequency: { in: ["daily", "weekly", "monthly", "custom_cron"] },
      keywords: { some: { ...runnableKeywordWhere(locations), projectId } },
    },
  });
  return schedule !== null;
}
