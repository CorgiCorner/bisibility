import { notificationTransaction } from "@/lib/notifications/transaction";
import { refreshOperationIncident } from "@/lib/provider-evidence/incidents/refresh";
import { closedUnknownOperations } from "@/lib/provider-usage/uncertainty-closeout-state";
import { RECOVERY_MAX_LOOKUPS } from "./retry";
import { providerRecoveryScope } from "./scope";
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { recoverySwitches } from "./switches";

export async function lockRecoveryTask(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  taskId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`provider-recovery-task:${taskId}`}))::text`,
  );
}

export async function claimRecoveryIntent(intentId: string) {
  if (!recoverySwitches().lookup) return null;
  return notificationTransaction(async (tx) => {
    const intent = await tx.providerRecoveryIntent.findFirst({
      where: { id: intentId, candidate: providerRecoveryScope() },
      include: { candidate: true },
    });
    if (!intent) return null;
    if ((await closedUnknownOperations(tx, [intent.operationPk])).has(intent.operationPk))
      return null;
    const taskId = intent.candidate.queuedTaskId;
    if (taskId) await lockRecoveryTask(tx, taskId);
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const now = clock.now;
    if (taskId) {
      const task = await tx.queuedRankCheckTask.findUnique({
        where: { id: taskId },
      });
      if (task?.persistenceLeaseExpiresAt && task.persistenceLeaseExpiresAt > now) return null;
    }
    const exhausted = await tx.providerRecoveryIntent.updateMany({
      where: {
        id: intentId,
        attempts: { gte: RECOVERY_MAX_LOOKUPS },
        state: { in: ["scheduled", "attempting"] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        state: "operator_review",
        reason: "lookup_attempts_exhausted:lease_interrupted",
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (exhausted.count) {
      const evidence = await tx.providerOperationEvidence.findUniqueOrThrow({
        where: { operationPk: intent.operationPk },
      });
      await tx.providerOperationEvidence.update({
        where: { operationPk: intent.operationPk },
        data: {
          recoveryState: "operator_review",
          recoveryReason: "lookup_attempts_exhausted:lease_interrupted",
          nextAttemptAt: null,
          ...(evidence.accounting === null || evidence.accounting === "unknown"
            ? {
                accounting: "unknown",
                exhaustionStatus: "exhausted",
                exhaustionReason: "lookup_attempts_exhausted:lease_interrupted",
              }
            : {}),
        },
      });
      await refreshOperationIncident(tx, intent.operationPk);
      return null;
    }
    const owner = randomUUID();
    const changed = await tx.providerRecoveryIntent.updateMany({
      where: {
        id: intentId,
        state: { in: ["scheduled", "attempting"] },
        attempts: { lt: RECOVERY_MAX_LOOKUPS },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }],
      },
      data: {
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
        lastAttemptAt: now,
        attempts: { increment: 1 },
        state: "attempting",
      },
    });
    if (changed.count)
      await tx.providerOperationEvidence.update({
        where: { operationPk: intent.operationPk },
        data: {
          recoveryState: "attempting",
          lastAttemptAt: now,
          nextAttemptAt: null,
        },
      });
    return changed.count ? { intentId, owner } : null;
  });
}
export async function finishRecoveryLookup(
  lease: { intentId: string; owner: string },
  reason: string,
  now = new Date(),
) {
  return notificationTransaction(async (tx) => {
    const changed = await tx.providerRecoveryIntent.updateMany({
      where: {
        id: lease.intentId,
        leaseOwner: lease.owner,
        leaseExpiresAt: { gt: now },
        state: "attempting",
      },
      data: {
        state: "operator_review",
        reason,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (changed.count) {
      const intent = await tx.providerRecoveryIntent.findUniqueOrThrow({
        where: { id: lease.intentId },
      });
      await tx.providerOperationEvidence.update({
        where: { operationPk: intent.operationPk },
        data: {
          recoveryState: "operator_review",
          recoveryReason: reason,
          nextAttemptAt: null,
          lastAttemptAt: intent.lastAttemptAt,
        },
      });
    }
    return changed;
  });
}
