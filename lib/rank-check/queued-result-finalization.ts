import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  claimQueuedPersistenceLease,
  type QueuedPersistenceLease,
  transitionQueuedPersistenceLease,
} from "./queued-persistence-lease";
import { queuedResultTransactionOptions } from "./queued-result-attempt";
import { loadQueuedTask } from "./queued-results-load";

export function claimQueuedResultTask(taskId: string) {
  return prisma.$transaction(async (tx) => {
    const lease = await claimQueuedPersistenceLease(taskId, tx);
    if (!lease) return null;
    return { lease, task: await loadQueuedTask(taskId, tx) };
  }, queuedResultTransactionOptions);
}

export function terminalizeLease(lease: QueuedPersistenceLease, state: "completed" | "failed") {
  return async (tx: Prisma.TransactionClient) => {
    await transitionQueuedPersistenceLease(lease, ["persisting"], { state }, tx);
  };
}
