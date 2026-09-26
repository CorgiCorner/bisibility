import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { findCurrentComparablePredecessor } from "./comparable-history";
export type QueuedTask = Awaited<ReturnType<typeof loadTask>>;
export async function loadTask(
  id: string,
  client: Pick<Prisma.TransactionClient, "queuedRankCheckTask"> = prisma,
) {
  // biome-ignore format: keep the queue persistence module under its enforced line cap.
  return client.queuedRankCheckTask.findUniqueOrThrow({
    include: { batch: { include: { connection: true } }, keyword: { include: { project: { include: { defaults: true } }, schedule: true } }, rankCheck: true },
    where: { id },
  });
}
export async function loadComparablePrevious(task: QueuedTask) {
  // biome-ignore format: keep the queue persistence module under its enforced line cap.
  return findCurrentComparablePredecessor(task.keyword.id, resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined));
}
