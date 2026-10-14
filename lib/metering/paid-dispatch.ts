import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { Operation } from "@usagekit/core";
import type {
  PaidAttemptGrant,
  PaidAttemptOptions,
  PaidAttemptReservation,
} from "./paid-attempt-types";
import { verifyPaidBinding } from "./paid-binding";
import { lockPaidOperation, paidContext } from "./paid-context";
import { readPaidFenceReference } from "./paid-fence-references";
import { createTransactionMeter, paidAttemptClock, readPaidOperation } from "./transaction-meter";

const ref = (operation: Operation) => ({
  namespace: operation.scope.namespace,
  principal: operation.scope.principal,
  operationId: operation.operationId,
});
/** A fresh reservation obtains intent only when its worker is ready for transport. */
export async function markPaidAttemptDispatch(
  tx: Prisma.TransactionClient,
  reservation: PaidAttemptReservation,
  holder: string,
  options: PaidAttemptOptions = {},
): Promise<PaidAttemptGrant> {
  if (reservation.replayed) throw new Error("Paid reservation replay never grants dispatch");
  const clock = options.clock ?? paidAttemptClock;
  const meter = await createTransactionMeter(tx, clock);
  const operation = await readPaidOperation(meter, ref(reservation.operation));
  // Read immutable context before taking business locks; the locked copy is checked below.
  const [context] = await tx.$queryRaw<
    { context: import("./paid-attempt-types").PaidAttemptContext }[]
  >`SELECT context FROM metering_paid_attempt_context WHERE namespace=${operation.scope.namespace} AND operation_id=${operation.operationId}`;
  if (!context) throw new Error("Paid dispatch context is unavailable");
  await verifyPaidBinding(tx, operation, context.context, options);
  await lockPaidOperation(tx, operation);
  const retained = await paidContext(tx, ref(operation));
  if (retained.dispatch_lease_id || retained.transportFenced)
    throw new Error("Paid dispatch intent already exists");
  const result = await meter.markDispatchIntent({
    ...ref(operation),
    commandId: "paid:first-intent",
    expectedVersion: reservation.operation.version,
    holder,
    leaseTtlMs: 60000,
  });
  if (!("granted" in result) || !result.granted) throw new Error("Paid dispatch intent refused");
  await tx.$executeRaw`UPDATE metering_paid_attempt_context SET dispatch_lease_id=${result.lease.leaseId} WHERE namespace=${operation.scope.namespace} AND operation_id=${operation.operationId}`;
  return { operation: result.operation, lease: result.lease };
}

/** This commit is the possible-send proof. A transaction replay must stop before HTTP. */
export async function fencePaidAttemptsInTransaction(
  tx: Prisma.TransactionClient,
  grants: readonly PaidAttemptGrant[],
  options: PaidAttemptOptions = {},
) {
  if (!grants.length || grants.length > 100) throw new RangeError("Invalid paid transport taskset");
  const clock = options.clock ?? paidAttemptClock;
  const ordered = [...grants].sort(
    (a, b) =>
      a.operation.scope.connection.localeCompare(b.operation.scope.connection) ||
      a.operation.operationId.localeCompare(b.operation.operationId),
  );
  const operations = [];
  const recoveryChecks = new Set<string>();
  for (const grant of ordered) {
    const reference = await readPaidFenceReference(tx, ref(grant.operation));
    if (reference.context.recoveryGrantExpiresAt) {
      const target = JSON.stringify([
        reference.context.rankCheckRunId,
        reference.context.keywordId,
      ]);
      if (recoveryChecks.has(target))
        throw new Error("Original run recovery attempt limit reached");
      recoveryChecks.add(target);
    }
    operations.push({ grant, operation: reference.operation, context: reference.context });
  }
  // Acquire semantic business locks before native binding/accounting locks; no request/grant is minted here.
  const references = operations.map(({ grant, operation, context }) => ({
    operation,
    lease: grant.lease,
    context,
  }));
  await options.beforeFence?.lockBusiness(tx, references);
  const meter = await createTransactionMeter(tx, clock);
  for (const { operation, context } of operations)
    await verifyPaidBinding(tx, operation, context, options);
  for (const { operation } of operations) await lockPaidOperation(tx, operation);
  const verified = [];
  for (const { grant, operation: original } of operations) {
    const operation = await readPaidOperation(meter, ref(original));
    const context = await paidContext(tx, ref(operation));
    if (
      context.transportFenced ||
      context.dispatch_lease_id !== grant.lease.leaseId ||
      operation.state !== "dispatch_intended" ||
      operation.lease?.leaseId !== grant.lease.leaseId ||
      operation.lease.holder !== grant.lease.holder
    )
      throw new Error("Paid transport holder is fenced out");
    if (new Date(operation.lease.expiresAt) <= clock.now())
      throw new Error("Paid transport lease expired");
    verified.push({ operation, lease: grant.lease, context: context.context });
  }
  await options.beforeFence?.assertDispatch(tx, verified);
  for (const { operation } of verified) {
    const fencedAt = clock.now();
    await tx.$executeRaw`UPDATE metering_paid_attempt_context
      SET fenced_at=${fencedAt}, fenced_at_iso=${fencedAt.toISOString()}
      WHERE namespace=${operation.scope.namespace} AND operation_id=${operation.operationId}`;
  }
}
export async function fencePaidAttempt(
  db: PrismaClient,
  grant: PaidAttemptGrant,
  options: PaidAttemptOptions = {},
) {
  await db.$transaction((tx) => fencePaidAttemptsInTransaction(tx, [grant], options));
}
