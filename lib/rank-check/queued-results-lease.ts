import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  type QueuedPersistenceLease,
  transitionQueuedPersistenceLease,
} from "./queued-persistence-lease";
import {
  queuedResultReleaseTransactionOptions,
  queuedResultTransactionOptions,
} from "./queued-result-attempt";
import { ACTIVE_QUEUED_TASK_STATES, queuedTaskStateForRankCheck } from "./queued-state";

export async function reconcileTaskWithRankCheck(lease: QueuedPersistenceLease) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.queuedRankCheckTask.findUniqueOrThrow({
      select: { rankCheck: { select: { status: true } }, state: true },
      where: { id: lease.taskId },
    });
    const state = queuedTaskStateForRankCheck(task.rankCheck.status);
    if (!state) return task.state;
    return transitionQueuedPersistenceLease(lease, ACTIVE_QUEUED_TASK_STATES, { state }, tx);
  }, queuedResultTransactionOptions);
}

export async function transitionLease(
  lease: QueuedPersistenceLease,
  data: { error?: string | null; state: string },
  transactionOptions = queuedResultTransactionOptions,
) {
  return prisma.$transaction(
    (tx) => transitionQueuedPersistenceLease(lease, ["persisting"], data, tx),
    transactionOptions,
  );
}

export async function releaseAbortedLease(
  task: { error: string | null },
  lease: QueuedPersistenceLease,
) {
  await transitionLease(
    lease,
    { state: task.error ? "provider_failed" : "ready" },
    queuedResultReleaseTransactionOptions,
  );
}
