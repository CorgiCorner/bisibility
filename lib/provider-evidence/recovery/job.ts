import { applyRecoveryLookup } from "./apply";
import { retryInterruptedRecovery } from "./retry-failure";
import { providerRecoveryScope } from "./scope";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { claimRecoveryIntent, finishRecoveryLookup } from "./lease";
import { type LookupDependencies, lookupRecoveryEvidence } from "./lookup";
import { recoveryWriteGateOpen } from "./predicate";
import { recoverySwitches } from "./switches";

export async function runRecoveryLookup(intentId: string, dependencies?: LookupDependencies) {
  if (!recoverySwitches().lookup) return { kind: "inactive" as const };
  const lease = await claimRecoveryIntent(intentId);
  if (!lease) return { kind: "not_claimed" as const };
  try {
    const intent = await prisma.providerRecoveryIntent.findUniqueOrThrow({
      where: { id: intentId },
    });
    const operation = await prisma.meteringOperation.findUniqueOrThrow({
      where: { operation_pk: intent.operationPk },
      include: {
        providerDispatchIdentity: true,
        paidAttemptContext: true,
        receipts: { orderBy: { sequence: "desc" }, take: 1 },
      },
    });
    const original = operation.paidAttemptContext;
    if (
      !original ||
      original.dispatch_lease_id !== intent.attemptId ||
      !original.fenced_at ||
      (operation.providerDispatchIdentity &&
        operation.providerDispatchIdentity.principal !== original.principal) ||
      operation.state === "released"
    ) {
      await finishRecoveryLookup(lease, "original_attempt_unavailable");
      return { kind: "operator_review" as const };
    }
    const receipt = operation.receipts[0]?.body;
    let nativeId =
      receipt &&
      typeof receipt === "object" &&
      !Array.isArray(receipt) &&
      typeof receipt.providerRequestId === "string"
        ? receipt.providerRequestId
        : null;
    if (!nativeId && operation.providerDispatchIdentity?.queuedTaskId) {
      const task = await prisma.queuedRankCheckTask.findUnique({
        where: { id: operation.providerDispatchIdentity.queuedTaskId },
      });
      if (task?.rankCheckId === operation.providerDispatchIdentity.rankCheckId)
        nativeId = task.providerTaskId;
    }
    const outcome = await lookupRecoveryEvidence(
      operation.providerDispatchIdentity,
      nativeId,
      new Date(),
      dependencies,
    );
    const writeGateOpen = recoveryWriteGateOpen(original);
    const applied = await applyRecoveryLookup(lease, outcome);
    return { ...outcome, writeGateOpen, applied };
  } catch {
    const retry = await retryInterruptedRecovery(lease);
    return { kind: "retry_scheduled" as const, retry };
  }
}

export async function processRecoveryLookups(dependencies?: LookupDependencies) {
  if (!recoverySwitches().lookup) return;
  const rows = await prisma.providerRecoveryIntent.findMany({
    where: {
      state: { in: ["scheduled", "attempting"] },
      candidate: providerRecoveryScope(),
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const row of rows) await runRecoveryLookup(row.id, dependencies);
}
