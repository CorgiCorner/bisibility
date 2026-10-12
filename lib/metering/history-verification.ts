import type { Operation, Quantity } from "@usagekit/core";
import { historyBudgets } from "./history-budgets";
import { historyProofs, historySourceHash } from "./history-evidence";
import type { LegacyUsageSource } from "./history-types";
import { contribution, currentBudgets, historicalBudget, usage } from "./store/budgets";
import { canonical, decode, effective, hash, plus } from "./store/codec";
import { validateEpochs } from "./store/history-validation";
import { hydrate, type OperationRow, operationRow } from "./store/records";
import { Prisma, type Sql } from "./store/sql";

const migrationId = "20261011021000_accounting_history";
type Journal = {
  source_id: string;
  source_hash: string;
  target_hash: string;
  namespace: string;
  operation_id: string;
  created_operation: boolean;
  body: unknown;
  payload: unknown;
};

/** Runs before readiness is acknowledged. Row counts alone are never sufficient. */
export async function verifyHistoricalImport(sql: Sql) {
  const missing = await sql.query(Prisma.sql`SELECT s.source_id FROM metering_legacy_usage_source s
    LEFT JOIN metering_history_import j ON j.migration_id=${migrationId} AND j.source_id=s.source_id WHERE j.source_id IS NULL LIMIT 1`);
  if (missing.length) throw new Error("Historical source mapping is incomplete");
  const orphan = await sql.query(Prisma.sql`SELECT j.source_id FROM metering_history_import j
    LEFT JOIN metering_legacy_usage_source s ON s.source_id=j.source_id WHERE j.migration_id=${migrationId} AND s.source_id IS NULL LIMIT 1`);
  if (orphan.length) throw new Error("Historical source mapping is orphaned");
  const namespaces = new Set<string>();
  const [progress] = await sql.query<{ namespace: string | null }>(
    Prisma.sql`SELECT namespace FROM metering_history_progress WHERE migration_id=${migrationId}`,
  );
  if (progress?.namespace) namespaces.add(progress.namespace);
  let cursor = "";
  for (;;) {
    const rows =
      await sql.query<Journal>(Prisma.sql`SELECT j.*,s.payload FROM metering_history_import j
      JOIN metering_legacy_usage_source s ON s.source_id=j.source_id
      WHERE j.migration_id=${migrationId} AND j.source_id>${cursor} ORDER BY j.source_id LIMIT 200`);
    if (!rows.length) break;
    for (const row of rows) {
      namespaces.add(row.namespace);
      const source = decode<LegacyUsageSource>(row.payload);
      if (row.source_hash !== historySourceHash(source, await historyProofs(sql, row.source_id)))
        throw new Error("Historical source hash mismatch");
      const body = decode<{ input: Operation; operation: Operation }>(row.body);
      if (hash(canonical(body.input)) !== row.target_hash)
        throw new Error("Historical target hash mismatch");
      const stored = await operationRow(sql, row.namespace, row.operation_id);
      if (!stored) throw new Error("Historical operation mapping is missing");
      const operation = await hydrate(sql, stored);
      if (
        row.created_operation &&
        (operation.lease || !["pending", "settled", "released"].includes(operation.state))
      )
        throw new Error("Historical import created a dispatch capability");
      if (canonical(operation) !== canonical(body.operation))
        throw new Error("Historical operation evidence mismatch");
      await verifyGate(sql, operation);
      cursor = row.source_id;
    }
  }
  const badReference =
    await sql.query(Prisma.sql`SELECT s.reference_id FROM metering_legacy_reference_source s
    LEFT JOIN metering_history_reference r ON r.kind=s.kind AND r.reference_id=s.reference_id
    LEFT JOIN metering_history_import j ON j.source_id=s.source_id AND j.migration_id=${migrationId}
    LEFT JOIN metering_operation o ON o.namespace=j.namespace AND o.operation_id=j.operation_id
    LEFT JOIN metering_receipt receipt ON receipt.operation_pk=o.operation_pk AND receipt.receipt_id=r.receipt_id
    WHERE r.reference_id IS NULL OR r.namespace IS DISTINCT FROM j.namespace OR r.operation_id IS DISTINCT FROM j.operation_id OR r.source_id IS DISTINCT FROM s.source_id OR r.principal IS DISTINCT FROM o.principal OR receipt.receipt_pk IS NULL OR r.body->'legacy' IS DISTINCT FROM s.payload LIMIT 1`);
  if (badReference.length) throw new Error("Historical reference mapping mismatch");
  for (const namespace of namespaces) await historyBudgets(sql, namespace, false);
  await verifyCounters(sql);
}
async function verifyGate(sql: Sql, op: Operation) {
  if (op.state !== "pending") return;
  const budgets = await currentBudgets(sql, op.scope.namespace);
  const scopeBudgets = budgets.filter((b) =>
    b.scope.kind === "group"
      ? b.scope.group === op.scope.group
      : b.scope.kind === "connection" && b.scope.connection === op.scope.connection,
  );
  const unknown =
    op.provider === "historical-unknown" ||
    effective(op)?.cost.money === null ||
    effective(op)?.measurements.some(
      (m) => ["cents", "budget_cents", "customer_cents"].includes(m.unit) && m.quantity === null,
    ) ||
    op.budgetEpochs.some((e) => {
      const b = budgets.find((b) => b.id === e.budgetId);
      return b?.limit && !effective(op)?.measurements.find((m) => m.unit === b.unit)?.quantity;
    });
  if (
    unknown &&
    !scopeBudgets.some(
      (b) => b.unit === "paid_attempts" && b.limit?.value === 0n && b.onExceed === "block",
    )
  )
    throw new Error("Historical uncertainty gate is missing");
}
async function verifyCounters(sql: Sql) {
  const totals = new Map<
    string,
    {
      namespace: string;
      budgetId: string;
      version: number;
      epoch: string;
      used: Quantity;
      reserved: Quantity;
    }
  >();
  let cursor = "";
  for (;;) {
    const rows = await sql.query<OperationRow>(
      Prisma.sql`SELECT * FROM metering_operation WHERE operation_pk>${cursor} ORDER BY operation_pk LIMIT 200`,
    );
    if (!rows.length) break;
    for (const row of rows) {
      const op = await hydrate(sql, row);
      const budgets = await Promise.all(
        op.budgetEpochs.map((e) =>
          historicalBudget(sql, op.scope.namespace, e.budgetId, e.budgetVersion),
        ),
      );
      validateEpochs(op, budgets);
      for (const epoch of op.budgetEpochs) {
        const b = budgets.find((b) => b.id === epoch.budgetId);
        if (!b) throw new Error("Historical budget missing");
        const id = canonical([op.scope.namespace, b.id, epoch.epoch]);
        const value = contribution(op, b.unit),
          previous = totals.get(id);
        totals.set(id, {
          namespace: op.scope.namespace,
          budgetId: b.id,
          version: b.version,
          epoch: epoch.epoch,
          used: previous ? plus(previous.used, value.used) : value.used,
          reserved: previous ? plus(previous.reserved, value.reserved) : value.reserved,
        });
      }
      cursor = row.operation_pk;
    }
  }
  for (const value of totals.values()) {
    const b = await historicalBudget(sql, value.namespace, value.budgetId, value.version);
    const actual = await usage(sql, b, value.epoch);
    if (
      plus(actual.used, { ...value.used, value: -value.used.value }).value !== 0n ||
      plus(actual.reserved, { ...value.reserved, value: -value.reserved.value }).value !== 0n
    )
      throw new Error("Historical budget counter mismatch");
  }
  const stored = await sql.query<{
    namespace: string;
    budget_id: string;
    epoch: string;
    settled_value: { toString(): string };
    outstanding_value: { toString(): string };
  }>(Prisma.sql`SELECT * FROM metering_budget_usage`);
  for (const row of stored)
    if (
      !totals.has(canonical([row.namespace, row.budget_id, row.epoch])) &&
      (BigInt(row.settled_value.toString()) !== 0n ||
        BigInt(row.outstanding_value.toString()) !== 0n)
    )
      throw new Error("Historical orphan counter mismatch");
}
