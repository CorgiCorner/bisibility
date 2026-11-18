import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createTransactionMeter } from "@/lib/metering/transaction-meter";
import type { Lease, Operation } from "@usagekit/core";
import type { Clock } from "@usagekit/store";
import {
  claimStoppedAssistantAttempt,
  deferUnresolvedAssistantAttempt,
  OPEN_ATTEMPT_STATUSES,
  STOPPED_ATTEMPT_STATUS,
  settleStoppedAssistantAttempt,
} from "./accounting-deferred";
import { ASSISTANT_METERING_NAMESPACE } from "./accounting-scope";

/** Operator-only: recover accounting authority, never permission to send again. */
export async function reconcileUnknownAssistantAttempt(
  tx: Prisma.TransactionClient,
  operationId: string,
  principal: string,
  reason: string,
  clock?: Clock,
) {
  if (!reason.trim() || reason.length > 200)
    throw new Error("A reason of at most 200 characters is required");
  const attempt = await tx.assistantAttempt.findUnique({
    where: { operationId },
    include: { run: true },
  });
  if (!attempt || !OPEN_ATTEMPT_STATUSES.includes(attempt.status))
    throw new Error("Unknown assistant attempt not found");
  const project = await tx.project.findUnique({
    where: { id: attempt.run.projectId },
    select: { ownerId: true },
  });
  if (!project || project.ownerId !== principal)
    throw new Error("Assistant accounting principal mismatch");
  const holder = "assistant:operator-reconciliation";
  if (attempt.creditHoldId || attempt.status === STOPPED_ATTEMPT_STATUS) {
    // A stopped answer is charged its stop estimate, and an unresolved Credits attempt its stored
    // estimate or reservation, through the deferred charge: never released at zero.
    if (attempt.status !== STOPPED_ATTEMPT_STATUS)
      await deferUnresolvedAssistantAttempt(tx, operationId, clock?.now() ?? new Date());
    const claim = await claimStoppedAssistantAttempt(tx, operationId, holder, clock);
    if (!claim) throw new Error("Assistant recovery lease unavailable");
    const evidenceRef = reason.trim();
    return settleStoppedAssistantAttempt(tx, { ...claim, measured: null, evidenceRef }, clock);
  }
  const namespace = ASSISTANT_METERING_NAMESPACE;
  const meter = await createTransactionMeter(tx, clock);
  const claim = await meter.claimForRecovery({
    namespace,
    principal,
    operationId,
    holder,
    leaseTtlMs: 60000,
  });
  if (!("claimed" in claim) || !claim.claimed)
    throw new Error("Assistant recovery lease unavailable");
  if (
    claim.operation.correlationId !== attempt.runId ||
    claim.operation.scope.group !== attempt.run.projectId
  )
    throw new Error("Assistant recovery binding mismatch");
  const amount = BigInt(attempt.reservedMicroUsd.toString());
  const estimated = claim.operation.estimate.find((item) => item.unit === "usd_micro");
  if (estimated?.scale !== 0 || estimated.value !== amount)
    throw new Error("Assistant recovery estimate mismatch");
  const now = (clock?.now() ?? new Date()).toISOString();
  const result = await meter.settle({
    namespace,
    principal,
    operationId,
    commandId: "assistant:operator-estimate",
    expectedVersion: claim.operation.version,
    authority: { kind: "recovery", leaseId: claim.lease.leaseId },
    receipt: {
      id: `assistant:operator:${operationId}`,
      source: "dispatch",
      evidenceRef: reason.trim(),
      cost: { certainty: "estimated", money: { units: amount, currency: "USD" } },
      measurements: [
        {
          unit: "usd_micro",
          certainty: "estimated",
          quantity: { unit: "usd_micro", value: amount, scale: 0 },
        },
        {
          unit: "requests",
          certainty: "estimated",
          quantity: { unit: "requests", value: 1n, scale: 0 },
        },
      ],
      occurredAt: now,
      recordedAt: now,
      cached: false,
      failed: true,
    },
  });
  if (result.outcome !== "settled")
    throw new Error(`Assistant reconciliation refused: ${result.outcome}`);
  const updated = await tx.assistantAttempt.updateMany({
    where: { operationId, status: { in: ["unknown", "dispatched"] } },
    data: { status: "settled", settledMicroUsd: amount.toString() },
  });
  if (updated.count !== 1) throw new Error("Assistant attempt changed during reconciliation");
  await tx.$queryRaw`SELECT id FROM assistant_runs WHERE id=${attempt.runId} FOR UPDATE`;
  const run = await tx.assistantRun.findUniqueOrThrow({
    where: { id: attempt.runId },
    select: { costMicroUsd: true },
  });
  const unresolved = await tx.assistantAttempt.count({
    where: { runId: attempt.runId, status: { in: OPEN_ATTEMPT_STATUSES } },
  });
  await tx.assistantRun.update({
    where: { id: attempt.runId },
    data: {
      costMicroUsd: (BigInt(run.costMicroUsd?.toString() ?? "0") + amount).toString(),
      costCertainty: unresolved ? "unknown" : "estimated",
    },
  });
  return result;
}

/**
 * Dispatch flips an attempt from reserved in the same commit as the Meter dispatch intent, and a
 * reservation lives two minutes. A row still reserved after ten minutes was never sent and its
 * Meter reservation has expired, so the row is released for operators and views.
 */
export async function releaseStaleAssistantAttempts(
  tx: Prisma.TransactionClient,
  now = new Date(),
) {
  const result = await tx.assistantAttempt.updateMany({
    where: { status: "reserved", createdAt: { lt: new Date(now.getTime() - 600000) } },
    data: { status: "released" },
  });
  return result.count;
}

export type ReceiptlessOutcome = "rejected" | "aborted";

/**
 * Closes, under its own lease, a dispatched attempt that got nothing back from the provider (any
 * error status, a server error, 408, a lost connection before any response, or no request sent):
 * nothing arrived, so it settles at zero. A call this process cut ("aborted": stop, disconnect,
 * timeout) may have produced output and is never closed here; it is charged through the stop
 * settlement instead.
 */
export async function closeReceiptlessAssistantAttempt(
  tx: Prisma.TransactionClient,
  input: {
    operation: Operation;
    lease: Lease;
    outcome: ReceiptlessOutcome;
    /** A server error, 408 or lost connection before any response, not a certain refusal. */
    providerFailure?: boolean;
  },
  clock?: Clock,
) {
  const { operation, lease, outcome } = input;
  const providerFailure = input.providerFailure === true;
  // Counted by the zero-cost provider failure watch; a certain refusal is not.
  const stored = providerFailure ? { outcome, providerFailure: true } : { outcome };
  if (outcome !== "rejected") throw new Error("A stopped attempt is charged, never closed at zero");
  const attempt = await tx.assistantAttempt.findUnique({
    where: { operationId: operation.operationId },
  });
  if (attempt?.status !== "dispatched") throw new Error("Assistant attempt is not dispatched");
  const reason = providerFailure
    ? "provider failed before any response"
    : "provider refused the call before any response";
  if (attempt.creditHoldId) {
    if (!operation.creditAccountRef) throw new Error("Assistant credit hold is incomplete");
    const { closeUnknownAssistantCreditAttempt } = await import("./funding-extension");
    const holdId = attempt.creditHoldId;
    const walletId = operation.creditAccountRef;
    const close = { operation, leaseId: lease.leaseId, holdId, walletId, reason };
    await closeUnknownAssistantCreditAttempt(
      tx,
      { ...close, authority: "lease", rejected: true },
      clock,
    );
    await tx.assistantAttempt.update({
      where: { operationId: operation.operationId },
      data: { status: "released", settledMicroUsd: "0", usage: stored },
    });
    return;
  }
  const result = await (await createTransactionMeter(tx, clock)).settle({
    namespace: operation.scope.namespace,
    principal: operation.scope.principal,
    operationId: operation.operationId,
    commandId: `assistant:${outcome}`,
    expectedVersion: operation.version,
    authority: { kind: "lease", leaseId: lease.leaseId },
    receipt: {
      id: `assistant:${outcome}:${operation.operationId}`,
      source: "dispatch",
      evidenceRef: reason,
      cost: { certainty: "measured", money: { units: 0n, currency: "USD" } },
      measurements: [
        {
          unit: "usd_micro",
          certainty: "measured",
          quantity: { unit: "usd_micro", value: 0n, scale: 0 },
        },
        {
          unit: "requests",
          certainty: "measured",
          quantity: { unit: "requests", value: 1n, scale: 0 },
        },
      ],
      occurredAt: operation.updatedAt,
      recordedAt: operation.updatedAt,
      cached: false,
      failed: true,
    },
  });
  if (result.outcome !== "settled")
    throw new Error(`Assistant receiptless settlement refused: ${result.outcome}`);
  await tx.assistantAttempt.update({
    where: { operationId: operation.operationId },
    data: { status: "settled", settledMicroUsd: "0", usage: stored },
  });
}
