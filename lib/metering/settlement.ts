import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { reconcileSpendingGates } from "@/lib/provider-usage/reconcile-gates";
import type {
  CorrectionInput,
  Measurement,
  Operation,
  OperationRef,
  Receipt,
  ReleaseInput,
  SettleInput,
} from "@usagekit/core";
import { projectAdmissionMeasurements } from "./current-paid-measurements";
import type { PaidAttemptOptions } from "./paid-attempt-types";
import { lockPaidOperation, paidContext } from "./paid-context";
import { lockScopes, matchingScopes } from "./store/budgets";
import { createSql } from "./store/sql";
import { createTransactionMeter, paidAttemptClock, readPaidOperation } from "./transaction-meter";

async function settlementContext(
  tx: Prisma.TransactionClient,
  ref: OperationRef,
  options: PaidAttemptOptions,
) {
  const meter = await createTransactionMeter(tx, options.clock ?? paidAttemptClock);
  const original = await readPaidOperation(meter, ref);
  await lockPaidOperation(tx, original);
  await lockScopes(
    createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }),
    matchingScopes(original),
  );
  const context = await paidContext(tx, ref);
  const operation = await readPaidOperation(meter, ref);
  return { meter, operation, context };
}
async function settlementReceipt(
  tx: Prisma.TransactionClient,
  operation: Operation,
  receipt: Receipt,
  debitId: string | null,
  options: PaidAttemptOptions,
  correction: boolean,
) {
  if (operation.fundingSource === "byok") return projectAdmissionMeasurements(operation, receipt);
  let customer: Measurement | undefined;
  if (correction && debitId) {
    customer = operation.receipts.at(-1)?.measurements.find((m) => m.unit === "customer_cents");
  } else if (
    receipt.cost.certainty !== "measured" ||
    receipt.measurements.some(
      (m) =>
        !["customer_cents", "budget_cents", "paid_attempts", "cents"].includes(m.unit) &&
        m.certainty !== "measured",
    ) ||
    operation.estimate.some(
      (q) =>
        !["cents", "customer_cents", "budget_cents", "paid_attempts"].includes(q.unit) &&
        !receipt.measurements.some((m) => m.unit === q.unit && m.certainty === "measured"),
    )
  ) {
    customer = { unit: "customer_cents", certainty: "unknown", quantity: null };
  } else {
    if (!options.acknowledgeCharge)
      throw new Error("Platform settlement requires an acknowledged wallet charge");
    const ack = await options.acknowledgeCharge(
      tx,
      structuredClone(operation),
      structuredClone(receipt),
    );
    if (
      !ack.debitId ||
      ack.customerCents.unit !== "customer_cents" ||
      ack.customerCents.value < 0n ||
      (debitId && ack.debitId !== debitId)
    )
      throw new Error("Platform debit acknowledgement changed");
    await tx.$executeRaw`UPDATE metering_paid_attempt_context SET debit_id=${ack.debitId},
      context=jsonb_set(context,'{chargeReplayed}',to_jsonb(${ack.replayedCharge === true}::boolean))
      WHERE namespace=${operation.scope.namespace} AND operation_id=${operation.operationId}`;
    customer = {
      unit: "customer_cents",
      certainty: "measured" as const,
      quantity: ack.customerCents,
    };
  }
  if (!customer) throw new Error("Platform customer charge is unavailable");
  return projectAdmissionMeasurements(operation, {
    ...receipt,
    measurements: [...receipt.measurements.filter((m) => m.unit !== "customer_cents"), customer],
  });
}
/** Wallet acknowledgement, native receipt and Meter settlement share the caller's commit. */
export async function settlePaidAttempt(
  tx: Prisma.TransactionClient,
  input: SettleInput,
  options: PaidAttemptOptions = {},
) {
  input = structuredClone(input);
  const { meter, operation, context } = await settlementContext(tx, input, options);
  if (!context.fenced_at)
    throw new Error("Paid settlement requires retained transport fence evidence");
  const receipt = await settlementReceipt(
    tx,
    operation,
    input.receipt,
    context.debit_id,
    options,
    false,
  );
  const result = await meter.settle({ ...input, receipt });
  if (result.outcome !== "settled") throw new Error(`Paid settlement refused: ${result.outcome}`);
  await reconcileSpendingGates(tx, result.operation);
  return result;
}
/** Provider corrections retain the original customer charge and never invoke wallet pricing. */
export async function correctPaidAttempt(
  tx: Prisma.TransactionClient,
  input: CorrectionInput,
  options: PaidAttemptOptions = {},
) {
  input = structuredClone(input);
  const { meter, operation, context } = await settlementContext(tx, input, options);
  if (!context.fenced_at)
    throw new Error("Paid correction requires retained transport fence evidence");
  const receipt = await settlementReceipt(
    tx,
    operation,
    input.receipt,
    context.debit_id,
    options,
    true,
  );
  const result = await meter.correct({ ...input, receipt });
  if (result.outcome !== "settled") throw new Error("Paid correction refused");
  await reconcileSpendingGates(tx, result.operation);
  return result;
}
export async function releasePaidAttempt(
  tx: Prisma.TransactionClient,
  input: ReleaseInput,
  options: PaidAttemptOptions = {},
) {
  const { meter, context } = await settlementContext(tx, input, options);
  if (context.fenced_at) throw new Error("Possible paid acceptance cannot be cancelled as zero");
  const result = await meter.releaseUndispatched(input);
  if (result.outcome !== "released") throw new Error("Paid release refused");
  await reconcileSpendingGates(tx, result.operation);
  return result;
}
/** Recovery changes only accounting authority. Its lease is never a transport capability. */
export async function claimPaidAttemptRecovery(
  tx: Prisma.TransactionClient,
  ref: OperationRef,
  holder: string,
  options: PaidAttemptOptions = {},
) {
  const { meter } = await settlementContext(tx, ref, options);
  const result = await meter.claimForRecovery({ ...ref, holder, leaseTtlMs: 60000 });
  if (!("claimed" in result) || !result.claimed) throw new Error("Paid evidence recovery refused");
  return { ...result, authority: { kind: "recovery" as const, leaseId: result.lease.leaseId } };
}
