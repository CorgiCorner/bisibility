import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OperationRef } from "@usagekit/core";
import { projectAdmissionMeasurements } from "./current-paid-measurements";
import { lockPaidOperation, paidContext } from "./paid-context";
import { releasePaidAttempt } from "./settlement";
import { createTransactionMeter, readPaidOperation } from "./transaction-meter";

/** A retained, unfenced intent proves no send only while its original lease is live. */
export async function cancelUnsentPaidAttempt(tx: Prisma.TransactionClient, ref: OperationRef) {
  const meter = await createTransactionMeter(tx);
  await lockPaidOperation(tx, await readPaidOperation(meter, ref));
  const context = await paidContext(tx, ref);
  const operation = await readPaidOperation(meter, ref);
  if (context.fenced_at) throw new Error("Possible paid acceptance cannot be cancelled as zero");
  if (operation.state === "released") return;
  if (operation.state === "reserved") {
    await releasePaidAttempt(tx, {
      ...ref,
      expectedVersion: operation.version,
      commandId: "paid:no-send",
      reason: "transport_not_started",
    });
    return;
  }
  const proofId = `no-send:${ref.operationId}`;
  if (operation.state === "settled" && operation.receipts.at(-1)?.id === proofId) return;
  if (
    operation.state !== "dispatch_intended" ||
    !operation.lease ||
    operation.lease.leaseId !== context.dispatch_lease_id ||
    new Date(operation.lease.expiresAt) <= new Date()
  )
    throw new Error("Expired paid intent cannot prove no send");
  const result = await meter.settle({
    ...ref,
    expectedVersion: operation.version,
    commandId: "paid:no-send",
    authority: { kind: "lease", leaseId: operation.lease.leaseId },
    receipt: projectAdmissionMeasurements(operation, {
      id: proofId,
      evidenceRef: proofId,
      occurredAt: operation.createdAt,
      recordedAt: new Date().toISOString(),
      cached: false,
      failed: true,
      cost: { certainty: "measured", money: { currency: "USD", units: 0n } },
      measurements: operation.estimate.map((quantity) => ({
        certainty: "measured",
        unit: quantity.unit,
        quantity: { ...quantity, value: 0n },
      })),
    }),
  });
  if (result.outcome !== "settled") throw new Error("Paid no-send proof refused");
}
