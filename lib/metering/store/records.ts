import type {
  AllowanceExceeded,
  BudgetAlertCrossed,
  Operation,
  OperationRef,
  Receipt,
  ReserveInput,
} from "@usagekit/core";
import { decode, effective, encode, hash, identity, key, timestamp } from "./codec";
import { lock, Prisma, type Sql } from "./sql";

export type OperationRow = {
  operation_pk: string;
  namespace: string;
  principal: string;
  operation_id: string;
  input: unknown;
  state: Operation["state"];
  version: number;
  budget_epochs: unknown;
  reservation_expires_at: Date;
  lease_id: string | null;
  lease_holder: string | null;
  lease_expires_at: Date | null;
  lease_kind: "lease" | "recovery" | null;
  created_at: Date;
  updated_at: Date;
  semantic_hash: string;
  warnings: unknown;
  alerts: unknown;
};
export async function operationRow(sql: Sql, namespace: string, id: string) {
  const [row] = await sql.query<OperationRow>(
    Prisma.sql`SELECT * FROM metering_operation WHERE namespace=${namespace} AND operation_id=${id}`,
  );
  return row ?? null;
}
export async function hydrate(sql: Sql, row: OperationRow): Promise<Operation> {
  const receipts = await sql.query<{ body: unknown }>(
    Prisma.sql`SELECT body FROM metering_receipt WHERE operation_pk=${row.operation_pk} ORDER BY sequence`,
  );
  let lease: Operation["lease"] = null;
  if (row.lease_id) {
    if (!row.lease_holder || !row.lease_expires_at) throw new Error("Incomplete stored lease");
    lease = {
      leaseId: row.lease_id,
      holder: row.lease_holder,
      expiresAt: timestamp(row.lease_expires_at),
    };
  }
  return {
    ...decode<ReserveInput>(row.input),
    state: row.state,
    version: row.version,
    reservationExpiresAt: timestamp(row.reservation_expires_at),
    budgetEpochs: decode(row.budget_epochs),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    receipts: receipts.map((r) => decode<Receipt>(r.body)),
    lease,
  };
}
export async function find(sql: Sql, ref: OperationRef) {
  const row = await operationRow(sql, ref.namespace, ref.operationId);
  return row && row.principal === ref.principal ? { row, op: await hydrate(sql, row) } : null;
}
export async function insert(
  sql: Sql,
  op: Operation,
  warnings: readonly AllowanceExceeded[],
  alerts: readonly BudgetAlertCrossed[],
) {
  const {
    state: _,
    version: __,
    receipts: ___,
    lease: ____,
    createdAt: _____,
    updatedAt: ______,
    budgetEpochs: _______,
    reservationExpiresAt: ________,
    ...input
  } = op;
  await sql.execute(Prisma.sql`INSERT INTO metering_operation
    (operation_pk, namespace, principal, operation_id, state, version, semantic_hash, budget_epochs,
     reservation_expires_at, created_at, updated_at, input, warnings, alerts)
    VALUES (${key(op.scope.namespace, op.operationId)},${op.scope.namespace},${op.scope.principal},${op.operationId},
      ${op.state},${op.version},${hash(identity(input))},${encode(op.budgetEpochs)}::jsonb,
      ${new Date(op.reservationExpiresAt)},${new Date(op.createdAt)},${new Date(op.updatedAt)},${encode(input)}::jsonb,${encode(warnings)}::jsonb,${encode(alerts)}::jsonb)`);
}
export async function update(sql: Sql, before: Operation, op: Operation, leaseKind: string | null) {
  const count =
    await sql.execute(Prisma.sql`UPDATE metering_operation SET state=${op.state},version=${op.version},
    lease_id=${op.lease?.leaseId ?? null},lease_holder=${op.lease?.holder ?? null},
    lease_expires_at=${op.lease ? new Date(op.lease.expiresAt) : null},lease_kind=${leaseKind},updated_at=${new Date(op.updatedAt)}
    WHERE operation_pk=${key(op.scope.namespace, op.operationId)} AND version=${before.version}`);
  return count === 1;
}
export async function appendReceipt(sql: Sql, op: Operation, receipt: Receipt, sequence: number) {
  const pk = key(op.scope.namespace, op.operationId),
    rpk = key(pk, receipt.id);
  await sql.execute(Prisma.sql`INSERT INTO metering_receipt
    (receipt_pk,operation_pk,receipt_id,supersedes,body,occurred_at,recorded_at,cost_units,cost_certainty,sequence)
    VALUES(${rpk},${pk},${receipt.id},${receipt.supersedes ?? null},${encode(receipt)}::jsonb,
      ${new Date(receipt.occurredAt)},${new Date(receipt.recordedAt)},${receipt.cost.money?.units ?? null},${receipt.cost.certainty},${sequence})`);
  for (const m of receipt.measurements) {
    await sql.execute(Prisma.sql`INSERT INTO metering_measurement(receipt_pk,unit,value,scale,certainty)
      VALUES(${rpk},${m.unit},${m.quantity?.value.toString() ?? null}::numeric,${m.quantity?.scale ?? null},${m.certainty})`);
  }
}
export async function event(sql: Sql, op: Operation) {
  const pk = key(op.scope.namespace, op.operationId),
    receipt = effective(op);
  // Keep event IDs in commit order so a later commit cannot enter an existing cursor watermark.
  await lock(sql, "metering:event-commit-order");
  await sql.execute(Prisma.sql`INSERT INTO metering_event(operation_pk,namespace,state,receipt_pk,occurred_at)
    VALUES(${pk},${op.scope.namespace},${op.state},${receipt ? key(pk, receipt.id) : null},${receipt ? new Date(receipt.occurredAt) : null})`);
}
