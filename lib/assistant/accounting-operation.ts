import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createTransactionMeter } from "@/lib/metering/transaction-meter";
import type { Lease, Operation } from "@usagekit/core";
import type { Clock } from "@usagekit/store";
import { type AssistantAccountingBinding, assistantReservation } from "./accounting-scope";

/** Internal primitive: caller must validate and lock run, membership, funding and pricing first. */
export async function reserveAssistantAttempt(
  tx: Prisma.TransactionClient,
  binding: AssistantAccountingBinding,
  step: number,
  clock?: Clock,
) {
  const request = assistantReservation(binding);
  const units = new Set((request.estimate ?? []).map((item) => item.unit));
  if (!units.has("usd_micro") || !units.has("requests"))
    throw new Error("Assistant estimates must include usd_micro and requests");
  const result = await (await createTransactionMeter(tx, clock)).reserve(request);
  if (result.outcome !== "reserved" || result.replayed) return result;
  const amount = request.estimate?.find((q) => q.unit === "usd_micro");
  if (!amount) throw new Error("Missing assistant cost estimate");
  await tx.assistantAttempt.create({
    data: {
      operationId: request.operationId,
      runId: binding.runId,
      step,
      status: "reserved",
      reservedMicroUsd: amount.value.toString(),
    },
  });
  return result;
}

/** Must commit before transport starts. A replay is never permission to send. */
export async function dispatchAssistantAttempt(
  tx: Prisma.TransactionClient,
  operation: Operation,
  holder: string,
  clock?: Clock,
) {
  const meter = await createTransactionMeter(tx, clock);
  const result = await meter.markDispatchIntent({
    namespace: operation.scope.namespace,
    principal: operation.scope.principal,
    operationId: operation.operationId,
    commandId: "assistant:dispatch",
    expectedVersion: operation.version,
    holder,
    leaseTtlMs: 180000,
  });
  if (!("granted" in result) || !result.granted) throw new Error("Assistant dispatch refused");
  const updated = await tx.assistantAttempt.updateMany({
    where: { operationId: operation.operationId, status: "reserved" },
    data: { status: "dispatched", dispatchedAt: clock?.now() ?? new Date() },
  });
  if (updated.count !== 1) throw new Error("Assistant attempt is not reserved");
  return result;
}

export async function settleAssistantAttempt(
  tx: Prisma.TransactionClient,
  operation: Operation,
  lease: Lease,
  amount: bigint,
  requestId: string | null,
  usage: Prisma.InputJsonValue,
  clock?: Clock,
) {
  if (amount < 0n) throw new Error("Invalid assistant settlement amount");
  const now = operation.updatedAt;
  const result = await (await createTransactionMeter(tx, clock)).settle({
    namespace: operation.scope.namespace,
    principal: operation.scope.principal,
    operationId: operation.operationId,
    commandId: "assistant:settle",
    expectedVersion: operation.version,
    authority: { kind: "lease", leaseId: lease.leaseId },
    receipt: {
      id: `assistant:${operation.operationId}`,
      source: "dispatch",
      cost: { certainty: "measured", money: { units: amount, currency: "USD" } },
      measurements: [
        {
          unit: "usd_micro",
          quantity: { unit: "usd_micro", value: amount, scale: 0 },
          certainty: "measured",
        },
        {
          unit: "requests",
          quantity: { unit: "requests", value: 1n, scale: 0 },
          certainty: "measured",
        },
      ],
      ...(requestId ? { providerRequestId: requestId } : {}),
      providerPriceVersion: operation.providerPriceVersion,
      occurredAt: now,
      recordedAt: now,
      cached: false,
      failed: false,
    },
  });
  if (result.outcome !== "settled")
    throw new Error(`Assistant settlement refused: ${result.outcome}`);
  if (!result.replayed) {
    const updated = await tx.assistantAttempt.updateMany({
      where: { operationId: operation.operationId, status: "dispatched" },
      data: {
        status: "settled",
        settledMicroUsd: amount.toString(),
        providerRequestId: requestId,
        usage,
      },
    });
    if (updated.count !== 1) throw new Error("Assistant attempt is not dispatched");
  }
  return result;
}

/** Missing evidence never releases a possibly dispatched reservation. */
export async function markAssistantAttemptUnknown(
  tx: Prisma.TransactionClient,
  operationId: string,
) {
  const updated = await tx.assistantAttempt.updateMany({
    where: { operationId, status: "dispatched" },
    data: { status: "unknown" },
  });
  if (updated.count !== 1) throw new Error("Assistant attempt is not dispatched");
}

/** Release is valid only before the dispatch-intent transaction has committed. */
export async function releaseAssistantAttempt(
  tx: Prisma.TransactionClient,
  operation: Operation,
  reason: string,
  clock?: Clock,
) {
  const result = await (await createTransactionMeter(tx, clock)).releaseUndispatched({
    namespace: operation.scope.namespace,
    principal: operation.scope.principal,
    operationId: operation.operationId,
    commandId: "assistant:release",
    expectedVersion: operation.version,
    reason,
  });
  if (result.outcome !== "released") throw new Error("Assistant release refused");
  if (!result.replayed) {
    const updated = await tx.assistantAttempt.updateMany({
      where: { operationId: operation.operationId, status: "reserved" },
      data: { status: "released" },
    });
    if (updated.count !== 1) throw new Error("Assistant attempt is not reserved");
  }
  return result;
}
