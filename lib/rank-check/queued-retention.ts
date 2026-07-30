import "server-only";

import { prisma } from "@/lib/db/prisma";

export const QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE = 100;
const TERMINAL_STATES = ["completed", "deferred", "failed"] as const;

export async function purgeExpiredQueuedRankCheckBatches(now = new Date()) {
  const candidates = await prisma.queuedRankCheckBatch.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    take: QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE + 1,
    where: {
      expiresAt: { lt: now },
      state: { in: [...TERMINAL_STATES] },
    },
  });
  const page = candidates.slice(0, QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE);
  const deleted =
    page.length === 0
      ? 0
      : (
          await prisma.queuedRankCheckBatch.deleteMany({
            where: { id: { in: page.map((batch) => batch.id) } },
          })
        ).count;
  return {
    deleted,
    hasMore: candidates.length > QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE,
    pageSize: QUEUED_RANK_CHECK_RETENTION_PAGE_SIZE,
  };
}
