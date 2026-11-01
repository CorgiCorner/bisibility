import { queueCheckSummary } from "@/lib/notifications/check-summaries/triggers";
import { onRecoveryEnqueued } from "@/lib/provider-evidence/incidents/enqueue";
import { closedUnknownOperations } from "@/lib/provider-usage/uncertainty-closeout-state";

export { onRecoveryEnqueued } from "@/lib/provider-evidence/incidents/enqueue";

import { providerRecoveryScope } from "./scope";
import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { attemptDimensions, recoveryAttempts } from "./attempts";
import type { OnRecoveryEnqueued } from "./enqueue-contract";
import { recoveryStartDecision } from "./predicate";
import { recoverySwitches } from "./switches";

export type { OnRecoveryEnqueued, RecoveryEnqueued } from "./enqueue-contract";

export async function enqueueWaitingRecovery(
  tx: Prisma.TransactionClient,
  rankCheckId: string,
  now = new Date(),
  onEnqueued: OnRecoveryEnqueued = onRecoveryEnqueued,
) {
  if (!recoverySwitches().capture) return 0;
  await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${rankCheckId} FOR UPDATE`;
  const check = await tx.rankCheck.findUnique({ where: { id: rankCheckId } });
  if (!check) return 0;
  const candidates = await tx.providerRecoveryCandidate.findMany({
    where: { ...providerRecoveryScope(), rankCheckId },
  });
  const attempts = await recoveryAttempts(tx, rankCheckId);
  const closed = await closedUnknownOperations(
    tx,
    candidates.map((c) => c.operationPk),
  );
  let count = 0;
  for (const candidate of candidates) {
    if (closed.has(candidate.operationPk)) continue;
    const attempt = attempts.find(
      (a) =>
        a.operation.operation_pk === candidate.operationPk &&
        a.dispatch_lease_id === candidate.attemptId,
    );
    if (!attempt) continue;
    const task = candidate.queuedTaskId
      ? await tx.queuedRankCheckTask.findUnique({
          where: { id: candidate.queuedTaskId },
          include: { batch: true },
        })
      : null;
    if (check.status === "completed") {
      await tx.providerRecoveryCandidate.update({
        where: { id: candidate.id },
        data: { accountingOnly: true },
      });
      await tx.providerRecoveryIntent.updateMany({
        where: { candidateId: candidate.id, accountingOnly: false },
        data: { accountingOnly: true },
      });
    }
    const decision = recoveryStartDecision(
      {
        ...attemptDimensions(attempt, check),
        operationState: attempt.operation.state,
        transportFenced: attempt.fenced_at !== null,
        stopReason: candidate.stopReason,
        queued: candidate.queuedTaskId !== null,
        queueDeadlineAt: task?.batch.queueDeadlineAt ?? null,
        pollingStoppedAt: candidate.pollingStoppedAt,
      },
      now,
    );
    if (decision !== "enqueue") continue;
    const accountingOnly = check.status === "completed";
    const created = await tx.providerRecoveryIntent.createMany({
      data: {
        id: randomUUID(),
        candidateId: candidate.id,
        operationPk: candidate.operationPk,
        attemptId: candidate.attemptId,
        accountingOnly,
        nextAttemptAt: now,
      },
      skipDuplicates: true,
    });
    if (!created.count) continue;
    await tx.providerRecoveryCandidate.update({
      where: { id: candidate.id },
      data: { accountingOnly },
    });
    await tx.providerOperationEvidence.upsert({
      where: { operationPk: candidate.operationPk },
      create: {
        operationPk: candidate.operationPk,
        recoveryState: "scheduled",
      },
      update: { recoveryState: "scheduled" },
    });
    const intent = await tx.providerRecoveryIntent.findUniqueOrThrow({
      where: { candidateId: candidate.id },
    });
    await onEnqueued(tx, intent);
    if (!accountingOnly) queueCheckSummary(tx, rankCheckId);
    count++;
  }
  return count;
}
