import { queueCheckSummary } from "@/lib/notifications/check-summaries/triggers";
import { notificationTransaction } from "@/lib/notifications/transaction";
import "server-only";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import {
  acknowledgeQueuedRankAttempt,
  captureRecoveryCandidate,
} from "@/lib/provider-evidence/recovery/capture";
import { lockRecoveryTask } from "@/lib/provider-evidence/recovery/lease";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { positiveCostCents } from "./cost";
import { storedDeferralReason } from "./deferral-reason";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
import {
  assertQueuedPersistenceLease,
  claimQueuedPersistenceLease,
  transitionQueuedPersistenceLease,
} from "./queued-persistence-lease";
import { withKeptReason } from "./queued-reason";
import {
  ACTIVE_QUEUED_BATCH_STATES,
  ACTIVE_QUEUED_TASK_STATES,
  countQueuedStates,
  queuedTaskStateForRankCheck,
} from "./queued-state";
import {
  QUEUED_DEADLINE_DB_MAX_WAIT_MS,
  QUEUED_DEADLINE_DB_TRANSACTION_TIMEOUT_MS,
} from "./queued-timeouts";
import { persistFailedRankCheckInTransaction } from "./runner-persistence";
import { applyRunItemTransition } from "./runs/items";

const RETENTION_MS = 30 * 86_400_000;

async function taskStateCounts(
  client: Pick<Prisma.TransactionClient, "queuedRankCheckTask">,
  batchId: string,
) {
  const groups = await client.queuedRankCheckTask.groupBy({
    _count: { _all: true },
    by: ["state"],
    where: { batchId },
  });
  return {
    completed: countQueuedStates(groups, ["completed"]),
    deferred: countQueuedStates(groups, ["deferred"]),
    failed: countQueuedStates(groups, ["failed"]),
    pending: countQueuedStates(groups, ACTIVE_QUEUED_TASK_STATES),
  };
}

export async function queuedBatchProgress(batchId: string) {
  const counts = await taskStateCounts(prisma, batchId);
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return {
    completed: counts.completed,
    deferred: counts.deferred,
    failed: counts.failed,
    pending: counts.pending,
    state: batch.state,
  };
}

async function reconcileTaskAtDeadline(
  tx: Prisma.TransactionClient,
  task: {
    id: string;
    batch: { connectionId: string | null };
    costCents: unknown;
    error: string | null;
    keyword: { id: string; projectId: string; publicId: string };
    rankCheck: {
      previousPosition: number | null;
      publicId: string;
      requestedDepth: number | null;
      status: string;
    };
    rankCheckId: string;
    state: string;
  },
  now: Date,
  reason: string,
  preSend: boolean,
) {
  await lockRecoveryTask(tx, task.id);
  const [current] = await tx.$queryRaw<
    Array<{ state: string; persistenceLeaseOwner: string | null }>
  >`SELECT state,"persistenceLeaseOwner" FROM queued_rank_check_tasks WHERE id=${task.id} FOR UPDATE`;
  if (!current || !ACTIVE_QUEUED_TASK_STATES.includes(current.state)) return;
  await captureRecoveryCandidate(tx, task.rankCheckId, { finishedAt: now }, now);
  const persistenceState = ["persisting", "provider_failed", "ready"].includes(current.state);
  const lease = persistenceState ? await claimQueuedPersistenceLease(task.id, tx, "cleanup") : null;
  if ((persistenceState && !lease) || (!persistenceState && current.persistenceLeaseOwner)) return;
  const knownCostCents = positiveCostCents(task.costCents);
  if (knownCostCents > 0) {
    try {
      await persistFailedRankCheckInTransaction(tx, {
        attempts: [{ message: task.error ?? reason, provider: "dataforseo" }],
        checkedAt: now,
        connectionId: task.batch.connectionId ?? undefined,
        error: task.error ?? reason,
        existingRankCheckId: task.rankCheckId,
        keywordId: task.keyword.id,
        keywordPublicId: task.keyword.publicId,
        persistenceFinalize: async (client) => {
          if (lease) {
            await transitionQueuedPersistenceLease(
              lease,
              ACTIVE_QUEUED_TASK_STATES,
              { error: task.error ?? reason, state: "failed" },
              client,
            );
            await acknowledgeQueuedRankAttempt(client, task.id);
            return;
          }
          const transitioned = await client.queuedRankCheckTask.updateMany({
            data: {
              error: task.error ?? reason,
              persistenceLeaseExpiresAt: null,
              persistenceLeaseOwner: null,
              state: "failed",
            },
            where: { id: task.id, state: { in: ACTIVE_QUEUED_TASK_STATES } },
          });
          if (transitioned.count !== 1) throw new RankCheckClosedBeforePersistenceError();
          await acknowledgeQueuedRankAttempt(client, task.id);
        },
        persistenceGuard: lease
          ? (client) => assertQueuedPersistenceLease(client, lease)
          : undefined,
        previousPosition: task.rankCheck.previousPosition,
        projectId: task.keyword.projectId,
        provider: "dataforseo",
        providerCostCents: knownCostCents,
        requestedDepth: resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
      });
      return;
    } catch (error) {
      if (!(error instanceof RankCheckClosedBeforePersistenceError)) throw error;
    }
  }
  // The deferral code names the expiry; the stored text keeps the first failure reason too.
  const detail = withKeptReason(task.error, reason);
  const closed = await tx.rankCheck.updateMany({
    data: {
      deferredReason: storedDeferralReason(reason),
      ...(preSend ? { attemptCount: 0 } : {}),
      error: detail,
      estimatedCostCents: null,
      comparisonAllowed: false,
      terminalPersistedAt: new Date(),
      finishedAt: now,
      normalizationVersion: null,
      status: "deferred",
    },
    where: { id: task.rankCheckId, status: "running" },
  });
  let taskState = "deferred";
  if (closed.count === 0) {
    const rankCheck = await tx.rankCheck.findUniqueOrThrow({
      select: { status: true },
      where: { id: task.rankCheckId },
    });
    taskState = queuedTaskStateForRankCheck(rankCheck.status) ?? task.rankCheck.status;
  }
  const terminalState = queuedTaskStateForRankCheck(taskState);
  if (!terminalState) return;
  const transition = {
    ...(terminalState === "deferred" ? { error: detail } : {}),
    state: terminalState,
  };
  if (lease) {
    await transitionQueuedPersistenceLease(lease, ACTIVE_QUEUED_TASK_STATES, transition, tx);
  } else {
    await tx.queuedRankCheckTask.updateMany({
      data: {
        ...transition,
        persistenceLeaseExpiresAt: null,
        persistenceLeaseOwner: null,
      },
      where: { id: task.id, state: { in: ACTIVE_QUEUED_TASK_STATES } },
    });
  }
  await acknowledgeQueuedRankAttempt(tx, task.id);
  if (closed.count === 0) return;
  queueCheckSummary(tx, task.rankCheckId);
  await applyRunItemTransition(tx, { rankCheckId: task.rankCheckId, to: "deferred" });
  await writeAudit(
    {
      action: "rank_check.deferred",
      actorId: null,
      after: {
        keywordId: requiredPublicAuditId(task.keyword.publicId, "kw", "Rank-check"),
        provider: "dataforseo",
        reason,
        status: "deferred",
      },
      before: { status: "running" },
      projectId: task.keyword.projectId,
      targetId: requiredPublicAuditId(task.rankCheck.publicId, "check", "Rank-check"),
      targetType: "rank_check",
    },
    tx,
  );
}

export async function deferQueuedRankCheckBatch(
  batchId: string,
  reason: string,
  options?: { preSend: true },
) {
  const now = new Date();
  const projectIds = await notificationTransaction(
    async (tx) => {
      const tasks = await tx.queuedRankCheckTask.findMany({
        orderBy: { id: "asc" },
        include: {
          batch: { select: { connectionId: true } },
          keyword: { select: { id: true, projectId: true, publicId: true } },
          rankCheck: {
            select: {
              previousPosition: true,
              publicId: true,
              requestedDepth: true,
              status: true,
            },
          },
        },
        where: { batchId, state: { in: ACTIVE_QUEUED_TASK_STATES } },
      });
      for (const task of tasks) {
        await reconcileTaskAtDeadline(tx, task, now, reason, options?.preSend === true);
      }
      return [...new Set(tasks.map((task) => task.keyword.projectId))];
    },
    {
      maxWait: QUEUED_DEADLINE_DB_MAX_WAIT_MS,
      timeout: QUEUED_DEADLINE_DB_TRANSACTION_TIMEOUT_MS,
    },
  );
  for (const projectId of projectIds) {
    await publishOperationChanged({ projectId }).catch(() => undefined);
  }
  return finalizeQueuedBatchState(batchId, reason);
}

function terminalBatchState(counts: Awaited<ReturnType<typeof taskStateCounts>>) {
  if (counts.failed > 0) return "failed";
  if (counts.deferred > 0) return "deferred";
  return "completed";
}

export async function finalizeQueuedBatchState(batchId: string, deferredReason?: string) {
  const counts = await taskStateCounts(prisma, batchId);
  if (counts.pending > 0) {
    const progress = await queuedBatchProgress(batchId);
    return progress;
  }
  const state = terminalBatchState(counts);
  const now = new Date();
  const current =
    state === "deferred" && deferredReason
      ? await prisma.queuedRankCheckBatch.findUniqueOrThrow({
          select: { error: true },
          where: { id: batchId },
        })
      : null;
  await prisma.queuedRankCheckBatch.updateMany({
    data: {
      ...(state === "deferred" && deferredReason
        ? { error: withKeptReason(current?.error, deferredReason) }
        : {}),
      expiresAt: new Date(now.getTime() + RETENTION_MS),
      state,
      terminalAt: now,
    },
    where: { id: batchId, state: { in: ACTIVE_QUEUED_BATCH_STATES } },
  });
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return {
    completed: counts.completed,
    failed: counts.failed,
    pending: counts.pending,
    state: batch.state,
  };
}
