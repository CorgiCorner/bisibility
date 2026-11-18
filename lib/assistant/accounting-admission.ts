import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import type { Clock } from "@usagekit/store";
import { AssistantBindingError, verifyAssistantBinding } from "./accounting-binding";
import { dispatchAssistantAttempt, reserveAssistantAttempt } from "./accounting-operation";
import { type AssistantAccountingBinding, assistantReservation } from "./accounting-scope";
import { admitAssistantCreditAttempt, dispatchAssistantCreditAttempt } from "./funding-extension";

/** Admission, binding checks and attempt creation share the caller's transaction. */
export async function admitAssistantAttempt(
  tx: Prisma.TransactionClient,
  binding: AssistantAccountingBinding,
  step: number,
  clock?: Clock,
) {
  if (binding.funding === "credits") {
    const reserved = await admitAssistantCreditAttempt(tx, binding, step, clock);
    return {
      outcome: "reserved" as const,
      operation: reserved.operation,
      replayed: reserved.replayed,
    };
  }
  await verifyAssistantBinding(tx, binding, clock?.now());
  return reserveAssistantAttempt(tx, binding, step, clock);
}

/** Rechecks membership and the frozen credential at the possible-send boundary. */
export async function dispatchBoundAssistantAttempt(
  tx: Prisma.TransactionClient,
  binding: AssistantAccountingBinding,
  operation: import("@usagekit/core").Operation,
  holder: string,
  clock?: Clock,
) {
  if (binding.funding === "credits")
    return dispatchAssistantCreditAttempt(tx, binding, operation, holder, clock);
  await verifyAssistantBinding(tx, binding, clock?.now());
  const expected = assistantReservation(binding);
  const original = await readPaidOperation(await createTransactionMeter(tx, clock), {
    namespace: expected.scope.namespace,
    principal: expected.scope.principal,
    operationId: expected.operationId,
  });
  const attempt = await tx.assistantAttempt.findUnique({
    where: { operationId: original.operationId },
  });
  const sameQuantities =
    original.estimate.length === (expected.estimate ?? []).length &&
    original.estimate.every((item) =>
      (expected.estimate ?? []).some(
        (q) => q.unit === item.unit && q.value === item.value && q.scale === item.scale,
      ),
    );
  if (
    !attempt ||
    attempt.runId !== binding.runId ||
    attempt.status !== "reserved" ||
    operation.version !== original.version ||
    original.scope.actor !== expected.scope.actor ||
    original.scope.group !== expected.scope.group ||
    original.scope.connection !== expected.scope.connection ||
    original.scope.providerCredentialVersion !== expected.scope.providerCredentialVersion ||
    original.scope.accessCredential?.id !== expected.scope.accessCredential?.id ||
    original.scope.accessCredential?.kind !== expected.scope.accessCredential?.kind ||
    JSON.stringify(original.scope.tags ?? []) !== JSON.stringify(expected.scope.tags ?? []) ||
    JSON.stringify([...(original.platformPools ?? [])].sort()) !==
      JSON.stringify([...(expected.platformPools ?? [])].sort()) ||
    original.operation !== expected.operation ||
    original.provider !== expected.provider ||
    original.fundingSource !== expected.fundingSource ||
    original.providerPriceVersion !== expected.providerPriceVersion ||
    original.correlationId !== expected.correlationId ||
    original.parentOperationId !== expected.parentOperationId ||
    !sameQuantities
  )
    throw new AssistantBindingError("accounting_unavailable");
  return dispatchAssistantAttempt(tx, original, holder, clock);
}
