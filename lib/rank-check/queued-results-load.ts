import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { findCurrentComparablePredecessor } from "./comparable-history";

export async function loadQueuedTask(
  id: string,
  client: Pick<Prisma.TransactionClient, "queuedRankCheckTask"> = prisma,
) {
  return client.queuedRankCheckTask.findUniqueOrThrow({
    include: {
      batch: { include: { connection: true } },
      keyword: { include: { project: { include: { defaults: true } }, schedule: true } },
      rankCheck: true,
    },
    where: { id },
  });
}

export type QueuedTask = Awaited<ReturnType<typeof loadQueuedTask>>;

export async function loadComparablePrevious(task: QueuedTask) {
  return findCurrentComparablePredecessor(
    task.keyword.id,
    resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
  );
}
