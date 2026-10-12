import { unresolvedSpendingGate } from "@/lib/metering/spending-limits";
import type { Operation } from "@usagekit/core";
import { lockConnectionAccounting } from "./accounting-lock";
import {
  currentBudgets,
  historicalBudget,
  lockScopes,
  matchingScopes,
  saveBudget,
  updateUsage,
} from "./budgets";
import { canonical, effective, encode, hash, key } from "./codec";
import {
  applies,
  originalEpoch,
  validateEpochs,
  validateHistoricalOperation,
} from "./history-validation";
import { appendReceipt, event, hydrate, insert, operationRow } from "./records";
import { createSql, lock, Prisma, type Sql } from "./sql";

export type HistoricalEvidenceInput = {
  migrationId: string;
  sourceId: string;
  sourceHash: string;
  operation: Operation;
  cutoverAt: string;
};
export type HistoricalEvidenceResult =
  | { outcome: "imported"; replayed: boolean; operationId: string }
  | { outcome: "conflict"; sourceId: string };

/** Caller owns the transaction, including business reference translation and batch progress. */
export async function importHistoricalEvidence(
  client: Sql | Prisma.TransactionClient,
  input: HistoricalEvidenceInput,
): Promise<HistoricalEvidenceResult> {
  const sql =
    "query" in client ? client : createSql(client, { statements: 0, changes: 0n, rowsRead: 0 });
  const op = structuredClone(input.operation);
  validateHistoricalOperation(op);
  const targetHash = hash(canonical(op));
  await lockConnectionAccounting(sql, op.scope.namespace, op.scope.connection);
  await lock(sql, `metering:history:${canonical([input.migrationId, input.sourceId])}`);
  await lock(sql, `metering:operation:${key(op.scope.namespace, op.operationId)}`);
  const [journal] = await sql.query<{ source_hash: string; target_hash: string }>(Prisma.sql`
    SELECT source_hash,target_hash FROM metering_history_import
    WHERE migration_id=${input.migrationId} AND source_id=${input.sourceId}`);
  if (journal)
    return journal.source_hash === input.sourceHash && journal.target_hash === targetHash
      ? { outcome: "imported", replayed: true, operationId: op.operationId }
      : { outcome: "conflict", sourceId: input.sourceId };
  const row = await operationRow(sql, op.scope.namespace, op.operationId);
  const existing = row ? await hydrate(sql, row) : null;
  if (
    existing &&
    canonical(existing) !==
      canonical({
        ...op,
        version: existing.version,
        updatedAt: existing.updatedAt,
        receipts: op.receipts.slice(0, existing.receipts.length),
      })
  )
    return { outcome: "conflict", sourceId: input.sourceId };
  await lockScopes(sql, matchingScopes(op));
  const budgets = await currentBudgets(
    sql,
    op.scope.namespace,
    matchingScopes(op),
    op.surface,
    op.source,
  );
  const explicit = await Promise.all(
    op.budgetEpochs.map((e) =>
      historicalBudget(sql, op.scope.namespace, e.budgetId, e.budgetVersion),
    ),
  );
  validateEpochs(op, explicit);
  const epochs = [
    ...op.budgetEpochs,
    ...budgets
      .filter(
        (b) =>
          applies(op, b) &&
          !b.id.startsWith("unresolved:") &&
          !op.budgetEpochs.some((e) => e.budgetId === b.id),
      )
      .map((b) => originalEpoch(op, b)),
  ];
  const imported = { ...op, budgetEpochs: epochs };
  for (const id of [...new Set(epochs.map((e) => e.budgetId))].sort())
    await lock(sql, `metering:budget:${canonical([op.scope.namespace, id])}`);
  if (!existing) {
    await insert(sql, imported, [], []);
    for (const [sequence, receipt] of imported.receipts.entries())
      await appendReceipt(sql, imported, receipt, sequence);
    await updateUsage(sql, null, imported);
    await event(sql, imported);
  } else {
    for (const [sequence, receipt] of imported.receipts.entries())
      if (sequence >= existing.receipts.length)
        await appendReceipt(sql, imported, receipt, sequence);
    if (imported.version !== existing.version) {
      await sql.execute(
        Prisma.sql`UPDATE metering_operation SET version=${imported.version},updated_at=${new Date(imported.updatedAt)} WHERE operation_pk=${row?.operation_pk}`,
      );
      await event(sql, imported);
    }
    // Attach only missing epochs to a canonical operation; never recount existing contributions.
    const added = epochs.filter(
      (e) =>
        !existing.budgetEpochs.some((old) => old.budgetId === e.budgetId && old.epoch === e.epoch),
    );
    await updateUsage(sql, existing, { ...imported, budgetEpochs: existing.budgetEpochs });
    await updateUsage(sql, null, { ...imported, budgetEpochs: added });
    await sql.execute(
      Prisma.sql`UPDATE metering_operation SET budget_epochs=${encode([...existing.budgetEpochs, ...added])}::jsonb WHERE operation_pk=${row?.operation_pk}`,
    );
  }
  if (imported.state === "pending") {
    const receipt = effective(imported);
    const uncertain =
      op.provider === "historical-unknown" ||
      receipt?.cost.money === null ||
      receipt?.measurements.some(
        (m) => ["cents", "budget_cents", "customer_cents"].includes(m.unit) && m.quantity === null,
      ) ||
      budgets.some(
        (b) => b.limit && !receipt?.measurements.find((m) => m.unit === b.unit)?.quantity,
      );
    if (uncertain) {
      const scopes = [
        ...(op.scope.group
          ? [{ kind: "group" as const, namespace: op.scope.namespace, group: op.scope.group }]
          : []),
        ...(op.scope.connection
          ? [
              {
                kind: "connection" as const,
                namespace: op.scope.namespace,
                connection: op.scope.connection,
              },
            ]
          : []),
      ];
      for (const scope of scopes) {
        const gate = unresolvedSpendingGate(scope, input.migrationId, input.cutoverAt, 1);
        const current = budgets.find((b) => b.id === gate.id);
        if (current?.limit?.value !== 0n) {
          const next = { ...gate, version: (current?.version ?? 0) + 1 };
          if ((await saveBudget(sql, next)).outcome !== "saved")
            throw new Error("Historical uncertainty gate conflict");
        }
      }
    }
  }
  await sql.execute(Prisma.sql`INSERT INTO metering_history_import
    (migration_id,source_id,source_hash,target_hash,namespace,operation_id,created_operation,body)
    VALUES(${input.migrationId},${input.sourceId},${input.sourceHash},${targetHash},${op.scope.namespace},${op.operationId},${!existing},${encode({ input: op, operation: imported })}::jsonb)`);
  return { outcome: "imported", replayed: false, operationId: op.operationId };
}
