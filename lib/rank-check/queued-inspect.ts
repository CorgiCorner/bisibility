import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  dataForSeoQueuedTaskTag,
  readyDataForSeoQueuedTasks,
} from "@/lib/providers/serp/dataforseo-queued";
import { finalizeQueuedBatchState } from "./queued-lifecycle";
import { queuedRankCheckModeAuthorization } from "./queued-mode";
import { pollDataForSeoQueue } from "./queued-provider-poll";
import { ACTIVE_QUEUED_BATCH_STATES } from "./queued-state";
import { rankCheckSchedulerMode } from "./scheduler-mode";

const ACTIVE_STATES = ["ambiguous", "prepared", "ready", "submitting", "submitted"] as const;
type QueuedInspectionOptions = {
  deadlineAt?: Date;
  signal?: AbortSignal;
};

function inspectionCounts(states: Array<{ state: string }>) {
  const count = (matches: string[]) => states.filter((task) => matches.includes(task.state)).length;
  return {
    ambiguous: count(["ambiguous", "submitting"]),
    pending: count(["prepared", "submitted"]),
    ready: count(["persisting", "provider_failed", "ready"]),
    terminal: count(["completed", "deferred", "failed"]),
  };
}

async function failUnrecoverableTasks(batchId: string, reason: string) {
  await prisma.$transaction([
    prisma.queuedRankCheckTask.updateMany({
      data: { error: reason, state: "provider_failed" },
      where: {
        batchId,
        state: { in: ["ambiguous", "submitting", "submitted"] },
      },
    }),
    prisma.queuedRankCheckBatch.updateMany({
      data: { error: reason, state: "ready" },
      where: { id: batchId, state: { in: ACTIVE_QUEUED_BATCH_STATES } },
    }),
  ]);
}

export async function inspectQueuedRankCheckBatch(
  batchId: string,
  options: QueuedInspectionOptions = {},
) {
  let deadlineReached = false;
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    include: {
      connection: true,
      tasks: { orderBy: { id: "asc" }, select: { id: true, state: true } },
    },
    where: { id: batchId },
  });
  const authorization = queuedRankCheckModeAuthorization(rankCheckSchedulerMode(), batch.state);
  if (
    authorization.allowPaidRetrieval &&
    ACTIVE_STATES.includes(batch.state as (typeof ACTIVE_STATES)[number])
  ) {
    const byTag = new Map(
      batch.tasks
        .filter((task) => ["ambiguous", "submitting", "submitted"].includes(task.state))
        .map((task) => [dataForSeoQueuedTaskTag(task.id), task.id]),
    );
    if (byTag.size > 0) {
      if (!batch.connection) {
        await failUnrecoverableTasks(
          batchId,
          "DataForSEO connection was removed during queued result recovery.",
        );
      } else {
        const credentials = resolveProviderCredentials(
          "dataforseo",
          batch.connection.credentialsEncrypted,
        );
        const polled = await pollDataForSeoQueue(
          credentials,
          batch.projectId,
          () =>
            readyDataForSeoQueuedTasks(credentials, new Set(byTag.keys()), {
              signal: options.signal,
            }),
          { deadlineAt: options.deadlineAt },
        ).catch(async (error) => {
          if (options.signal?.aborted) throw options.signal.reason ?? error;
          if (!(error instanceof DataForSeoError)) throw error;
          await failUnrecoverableTasks(batchId, error.message);
          return { status: "pending" as const };
        });
        if (polled.status === "deadline_reached") {
          deadlineReached = true;
        } else if (polled.status === "ready") {
          await prisma.$transaction(async (tx) => {
            for (const task of polled.value) {
              const id = byTag.get(task.tag);
              if (!id) continue;
              await tx.queuedRankCheckTask.updateMany({
                data: { error: null, providerTaskId: task.providerTaskId, state: "ready" },
                where: {
                  id,
                  state: { in: ["ambiguous", "submitting", "submitted"] },
                },
              });
            }
          });
        }
      }
    }
  }

  const tasks = await prisma.queuedRankCheckTask.findMany({
    select: { state: true },
    where: { batchId },
  });
  const counts = inspectionCounts(tasks);
  if (counts.pending + counts.ambiguous + counts.ready === 0) {
    const progress = await finalizeQueuedBatchState(batchId);
    return { ...counts, deadlineReached, state: progress.state };
  }
  const state = counts.ready > 0 ? "ready" : counts.ambiguous > 0 ? "ambiguous" : batch.state;
  let authoritativeState = state;
  if (state !== batch.state) {
    const changed = await prisma.queuedRankCheckBatch.updateMany({
      data: { state },
      where: { id: batchId, state: batch.state },
    });
    if (changed.count === 0) {
      const authoritative = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
        select: { state: true },
        where: { id: batchId },
      });
      authoritativeState = authoritative.state;
    }
  }
  return { ...counts, deadlineReached, state: authoritativeState };
}
