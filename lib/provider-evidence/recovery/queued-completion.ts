import { notificationTransaction } from "@/lib/notifications/transaction";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { captureRecoveryCandidate } from "./capture";
import { lockRecoveryTask } from "./lease";
import { providerRecoveryScope } from "./scope";
import { recoverySwitches } from "./switches";

export async function queuedSubmissionSnapshot(batchId: string) {
  if (!recoverySwitches().capture) return [] as string[];
  const scope = providerRecoveryScope();
  const tasks = await prisma.queuedRankCheckTask.findMany({
    where: { batchId },
    select: { id: true },
  });
  const rows = await prisma.providerDispatchIdentity.findMany({
    where: { ...scope, queuedTaskId: { in: tasks.map((t) => t.id) } },
    select: { operationPk: true },
  });
  return rows.map((row) => row.operationPk);
}

/** Only the winning submission's final stack records completion; collectors retain write ownership. */
export async function acknowledgeOriginalQueuedSubmission(
  batchId: string,
  preceding: readonly string[],
) {
  if (!recoverySwitches().capture) return;
  const scope = providerRecoveryScope();
  await notificationTransaction(async (tx) => {
    const tasks = await tx.queuedRankCheckTask.findMany({
      orderBy: { id: "asc" },
      where: {
        batchId,
      },
    });
    for (const task of tasks) {
      await lockRecoveryTask(tx, task.id);
      const [current] = await tx.$queryRaw<
        Array<{
          state: string;
          providerTaskId: string | null;
          persistenceLeaseOwner: string | null;
        }>
      >`
        SELECT state,"providerTaskId","persistenceLeaseOwner" FROM queued_rank_check_tasks WHERE id=${task.id} FOR UPDATE`;
      if (!current) continue;
      await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${task.rankCheckId} FOR UPDATE`;
      const owned = {
        namespace: scope.namespace,
        fenced_at: { not: null },
        operation: {
          operation_pk: { notIn: [...preceding] },
          state: { not: "released" },
          providerDispatchIdentity: { instanceId: scope.instanceId, queuedTaskId: task.id },
        },
      };
      await tx.meteringPaidAttemptContext.updateMany({
        where: owned,
        data: { submissionCompletedAt: new Date() },
      });
      if (current.persistenceLeaseOwner) continue;
      await tx.meteringPaidAttemptContext.updateMany({
        where: {
          namespace: scope.namespace,
          fenced_at: { not: null },
          completionAcknowledgedAt: null,
          operation: {
            operation_pk: { notIn: [...preceding] },
            state: { not: "released" },
            providerDispatchIdentity: { instanceId: scope.instanceId, queuedTaskId: task.id },
          },
        },
        data: { completionAcknowledgedAt: new Date() },
      });
      await captureRecoveryCandidate(tx, task.rankCheckId);
    }
  });
}

/** A later original collector takes back ownership before I/O, even if capture was disabled meanwhile. */
export async function clearQueuedRankAcknowledgment(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  taskId: string,
) {
  const scope = providerRecoveryScope();
  await tx.$queryRaw(Prisma.sql`
    UPDATE metering_paid_attempt_context c SET completion_acknowledged_at=NULL
    FROM metering_operation o JOIN provider_dispatch_identities d ON d."operationPk"=o.operation_pk
    WHERE c.namespace=o.namespace AND c.operation_id=o.operation_id
      AND c.namespace=${scope.namespace} AND d."instanceId"=${scope.instanceId}
      AND d."queuedTaskId"=${taskId} AND c.completion_acknowledged_at IS NOT NULL
    RETURNING c.operation_id`);
}
