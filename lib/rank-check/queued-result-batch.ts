import "server-only";
import { prisma } from "@/lib/db/prisma";
import { finishQueuedHostedExecutionIfPresent } from "./queued-hosted-results";
import { deferQueuedRankCheckBatch, finalizeQueuedBatchState } from "./queued-lifecycle";
import { authorizeQueuedRankCheckBatch } from "./queued-mode";
import {
  type QueuedResultAttemptOptions,
  runQueuedResultTasksWithinDeadline,
} from "./queued-result-attempt";
import { QUEUED_DEADLINE_REASON } from "./queued-timeouts";

export async function persistQueuedBatchTasks(
  batchId: string,
  options: QueuedResultAttemptOptions,
  persistTask: (id: string, options: QueuedResultAttemptOptions) => Promise<unknown>,
) {
  const authorization = await authorizeQueuedRankCheckBatch(batchId);
  if (!authorization.allowPaidRetrieval) {
    return deferQueuedRankCheckBatch(
      batchId,
      `Queued result retrieval is disabled in ${authorization.mode} scheduler mode.`,
    );
  }
  const tasks = await prisma.queuedRankCheckTask.findMany({
    orderBy: { id: "asc" },
    select: { id: true, providerTag: true },
    where: { batchId, state: { in: ["persisting", "provider_failed", "ready"] } },
  });
  const completed = await runQueuedResultTasksWithinDeadline(
    tasks.map((task) => task.id),
    options,
    persistTask,
  );
  if (!completed) return deferQueuedRankCheckBatch(batchId, QUEUED_DEADLINE_REASON);
  const result = await finalizeQueuedBatchState(batchId);
  await finishQueuedHostedExecutionIfPresent(batchId);
  return result;
}
