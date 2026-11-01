import { notificationTransaction } from "@/lib/notifications/transaction";
import { closedUnknownOperations } from "@/lib/provider-usage/uncertainty-closeout-state";
import { providerRecoveryScope } from "./scope";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { attemptDimensions, recoveryAttempts } from "./attempts";
import { enqueueWaitingRecovery, type OnRecoveryEnqueued } from "./enqueue";
import { type AttemptStopReason, recoveryStartDecision } from "./predicate";
import { recoverySwitches } from "./switches";

export async function captureRecoveryCandidate(
  tx: Prisma.TransactionClient,
  rankCheckId: string,
  input: {
    stopReason?: AttemptStopReason;
    pollingStopped?: boolean;
    finishedAt?: Date;
  } = {},
  now = new Date(),
  onEnqueued?: OnRecoveryEnqueued,
) {
  if (!recoverySwitches().capture) return;
  await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${rankCheckId} FOR UPDATE`;
  const check = await tx.rankCheck.findUnique({ where: { id: rankCheckId } });
  if (!check) return;
  const attempts = await recoveryAttempts(tx, rankCheckId);
  const closed = await closedUnknownOperations(
    tx,
    attempts.map((a) => a.operation.operation_pk),
  );
  for (const attempt of attempts) {
    if (closed.has(attempt.operation.operation_pk)) continue;
    if (!attempt.dispatch_lease_id || !attempt.fenced_at || attempt.operation.state === "released")
      continue;
    const dimensions = attemptDimensions(attempt, check);
    const decision = recoveryStartDecision(
      {
        ...dimensions,
        transportFenced: true,
        operationState: attempt.operation.state,
        stopReason: null,
        queued: false,
        queueDeadlineAt: null,
        pollingStoppedAt: null,
      },
      now,
    );
    if (decision === "not_needed") {
      await tx.providerRecoveryCandidate.deleteMany({
        where: {
          operationPk: attempt.operation.operation_pk,
          attemptId: attempt.dispatch_lease_id,
          intent: null,
        },
      });
      await tx.providerOperationEvidence.upsert({
        where: { operationPk: attempt.operation.operation_pk },
        create: {
          operationPk: attempt.operation.operation_pk,
          recoveryState: "not_needed",
        },
        update: { recoveryState: "not_needed" },
      });
      continue;
    }
    const task = await tx.queuedRankCheckTask.findUnique({
      where: { rankCheckId },
    });
    const data = {
      ...(input.stopReason ? { stopReason: input.stopReason } : {}),
      ...(input.pollingStopped ? { pollingStoppedAt: now } : {}),
      accountingOnly: check.status === "completed",
    };
    await tx.providerRecoveryCandidate.upsert({
      where: {
        operationPk_attemptId: {
          operationPk: attempt.operation.operation_pk,
          attemptId: attempt.dispatch_lease_id,
        },
      },
      create: {
        ...providerRecoveryScope(),
        ...data,
        operationPk: attempt.operation.operation_pk,
        attemptId: attempt.dispatch_lease_id,
        rankCheckId,
        queuedTaskId: task?.id ?? null,
      },
      update: data,
    });
    await tx.providerOperationEvidence.upsert({
      where: { operationPk: attempt.operation.operation_pk },
      create: {
        operationPk: attempt.operation.operation_pk,
        recoveryState: "waiting_for_attempt_end",
      },
      update: {},
    });
    // Accounting-only discovery must not alter any winner projection.
    if (
      check.status !== "completed" &&
      (!check.recoveryProvenance ||
        (!check.preRecoveryFinishedAt && (check.finishedAt || input.finishedAt)))
    ) {
      await tx.rankCheck.update({
        where: { id: rankCheckId },
        data: {
          preRecoveryFinishedAt: check.finishedAt ?? input.finishedAt ?? null,
          recoveryProvenance: check.recoveryProvenance ?? {
            version: 1,
            operationPk: attempt.operation.operation_pk,
            attemptId: attempt.dispatch_lease_id,
            capturedAt: now.toISOString(),
          },
        },
      });
    }
  }
  await enqueueWaitingRecovery(tx, rankCheckId, now, onEnqueued);
}

export async function markRecoveryAttemptStopped(
  rankCheckId: string,
  stopReason: AttemptStopReason,
  pollingStopped = false,
) {
  if (!recoverySwitches().capture) return;
  await notificationTransaction((tx) =>
    captureRecoveryCandidate(tx, rankCheckId, { stopReason, pollingStopped }),
  );
}

/** A later invocation cannot acknowledge any preceding invocation's operations. */
export async function originalRankAttemptSnapshot(rankCheckId: string) {
  if (!recoverySwitches().capture) return [] as string[];
  const rows = await prisma.meteringPaidAttemptContext.findMany({
    where: {
      namespace: providerRecoveryScope().namespace,
      context: { path: ["rankCheckId"], equals: rankCheckId },
    },
    select: { operation: { select: { operation_pk: true } } },
  });
  return rows.map((row) => row.operation.operation_pk);
}

/** Called by the original runner only after final settlement/persistence returns. */
export async function acknowledgeOriginalRankAttempt(
  rankCheckId: string,
  precedingOperations: readonly string[],
) {
  if (!recoverySwitches().capture) return;
  await notificationTransaction(async (tx) => {
    await tx.meteringPaidAttemptContext.updateMany({
      where: {
        namespace: providerRecoveryScope().namespace,
        context: { path: ["rankCheckId"], equals: rankCheckId },
        fenced_at: { not: null },
        completionAcknowledgedAt: null,
        operation: { operation_pk: { notIn: [...precedingOperations] } },
      },
      data: { completionAcknowledgedAt: new Date() },
    });
    const check = await tx.rankCheck.findUnique({
      where: { id: rankCheckId },
      select: { workflowRunId: true },
    });
    await captureRecoveryCandidate(
      tx,
      rankCheckId,
      check?.workflowRunId?.startsWith("inline-") ? { stopReason: "non_retryable" } : {},
    );
  });
}

/** Called by the original persistReady lease finalizer after provider settlement and persistence. */
export async function acknowledgeQueuedRankAttempt(tx: Prisma.TransactionClient, taskId: string) {
  if (!recoverySwitches().capture) return;
  const task = await tx.queuedRankCheckTask.findUnique({
    where: { id: taskId },
  });
  if (!task || !["completed", "failed", "deferred"].includes(task.state)) return;
  const scope = providerRecoveryScope();
  await tx.meteringPaidAttemptContext.updateMany({
    where: {
      namespace: scope.namespace,
      fenced_at: { not: null },
      completionAcknowledgedAt: null,
      submissionCompletedAt: { not: null },
      operation: {
        providerDispatchIdentity: {
          instanceId: scope.instanceId,
          queuedTaskId: taskId,
        },
      },
    },
    data: { completionAcknowledgedAt: new Date() },
  });
  await captureRecoveryCandidate(tx, task.rankCheckId);
}
