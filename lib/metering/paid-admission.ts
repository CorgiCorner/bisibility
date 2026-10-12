import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { preparePaidAttempt } from "./current-paid-quote";
import {
  PaidAttemptAdmissionError,
  type PaidAttemptInput,
  type PaidAttemptOptions,
  type PaidAttemptReservation,
} from "./paid-attempt-types";
import { verifyPaidBinding } from "./paid-binding";
import { lockPaidOperation, retainPaidContext } from "./paid-context";
import { lockScopes, matchingScopes } from "./store/budgets";
import { createSql } from "./store/sql";
import { createTransactionMeter, paidAttemptClock } from "./transaction-meter";

/** Throw on any denied child so the caller rolls back the complete durable taskset. */
export async function reservePaidAttempts(
  tx: Prisma.TransactionClient,
  inputs: readonly PaidAttemptInput[],
  options: PaidAttemptOptions = {},
): Promise<readonly PaidAttemptReservation[]> {
  inputs = structuredClone(inputs);
  if (!inputs.length || inputs.length > 100) throw new RangeError("Invalid paid taskset");
  if (
    new Set(
      inputs.map((i) =>
        JSON.stringify([
          i.reservation.scope.namespace,
          i.reservation.scope.principal,
          i.reservation.scope.group,
        ]),
      ),
    ).size !== 1
  )
    throw new Error("A paid taskset requires one financial namespace, principal and project");
  const prepared = inputs
    .map((input) => ({ input, request: preparePaidAttempt(input) }))
    .sort((a, b) => a.request.operationId.localeCompare(b.request.operationId));
  if (
    new Set(prepared.map((p) => JSON.stringify([p.request.scope.namespace, p.request.operationId])))
      .size !== prepared.length
  )
    throw new Error("Duplicate paid taskset child");
  const ordered = [...prepared].sort((a, b) =>
    a.request.scope.connection.localeCompare(b.request.scope.connection),
  );
  for (const { input, request } of ordered)
    await verifyPaidBinding(tx, request, input.context, options);
  for (const { request } of ordered) await lockPaidOperation(tx, request);
  await lockScopes(
    createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }),
    prepared.flatMap((p) => matchingScopes(p.request)),
  );
  const meter = await createTransactionMeter(tx, options.clock ?? paidAttemptClock);
  const results = new Map<string, PaidAttemptReservation>();
  for (const { input, request } of prepared) {
    const result = await meter.reserve(request);
    if (result.outcome !== "reserved")
      throw new PaidAttemptAdmissionError(result, {
        surface: request.surface,
        connectionId: input.context.connectionId,
        projectId: input.context.projectId,
      });
    await retainPaidContext(tx, request, input.context, result.replayed);
    results.set(request.operationId, { operation: result.operation, replayed: result.replayed });
  }
  return inputs.map((input) => {
    const result = results.get(input.reservation.operationId);
    if (!result) throw new Error("Paid taskset reservation is incomplete");
    return result;
  });
}
