import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OperationRef, ReserveInput } from "@usagekit/core";
import type { PaidAttemptContext } from "./paid-attempt-types";
import { lockConnectionAccounting } from "./store/accounting-lock";
import { canonical, key } from "./store/codec";
import { createSql, lock } from "./store/sql";

export type PaidContextRow = {
  principal: string;
  context: PaidAttemptContext & { chargeReplayed?: boolean };
  dispatch_lease_id: string | null;
  fenced_at: Date | null;
  debit_id: string | null;
};
export class PaidContextUnavailableError extends Error {}
function reservationContext(context: PaidContextRow["context"]) {
  const { chargeReplayed: _chargeReplayed, ...reservation } = context;
  return reservation;
}
export async function lockPaidOperation(tx: Prisma.TransactionClient, input: ReserveInput) {
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  await lockConnectionAccounting(sql, input.scope.namespace, input.scope.connection);
  await lock(sql, `metering:operation:${key(input.scope.namespace, input.operationId)}`);
}
export async function paidContext(tx: Prisma.TransactionClient, ref: OperationRef) {
  const [row] = await tx.$queryRaw<
    PaidContextRow[]
  >`SELECT principal, context, dispatch_lease_id, fenced_at, debit_id
    FROM metering_paid_attempt_context WHERE namespace=${ref.namespace} AND operation_id=${ref.operationId} FOR UPDATE`;
  if (!row || row.principal !== ref.principal)
    throw new PaidContextUnavailableError("Original paid attempt context is unavailable");
  return row;
}
export async function retainPaidContext(
  tx: Prisma.TransactionClient,
  input: ReserveInput,
  context: PaidAttemptContext,
  replayed: boolean,
) {
  const ref = {
    namespace: input.scope.namespace,
    operationId: input.operationId,
    principal: input.scope.principal,
  };
  if (!replayed)
    await tx.$executeRaw`INSERT INTO metering_paid_attempt_context(namespace, operation_id, principal, context)
    VALUES(${ref.namespace},${ref.operationId},${ref.principal},${JSON.stringify(context)}::jsonb)`;
  const stored = await paidContext(tx, ref);
  if (canonical(reservationContext(stored.context)) !== canonical(reservationContext(context)))
    throw new Error("Paid attempt context conflict");
}
