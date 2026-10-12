import { migrateAiReference } from "./history-ai-reference";
import { historyBudgets } from "./history-budgets";
import { historicalTarget, historyProofs, historySourceHash } from "./history-evidence";
import type { LegacyUsageSource } from "./history-types";
import { verifyHistoricalImport } from "./history-verification";
import { decode, effective, encode } from "./store/codec";
import { importHistoricalEvidence } from "./store/history";
import { Prisma, type Sql } from "./store/sql";

export { verifyHistoricalImport } from "./history-verification";
export const historyMigrationId = "20261011021000_accounting_history";

/** One bounded batch; caller commits its operation, references and durable cursor together. */
export async function runHistoricalImport(sql: Sql, namespace: string, batchSize: number) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error("Invalid historical batch size");
  const [progress] = await sql.query<{
    cursor: string;
    snapshot_at: Date;
    namespace: string | null;
  }>(
    Prisma.sql`SELECT cursor,snapshot_at,namespace FROM metering_history_progress WHERE migration_id=${historyMigrationId} FOR UPDATE`,
  );
  if (!progress) throw new Error("Historical snapshot is unavailable");
  if (progress.namespace && progress.namespace !== namespace)
    throw new Error("Historical migration namespace conflict");
  if (!progress.namespace) {
    await sql.execute(
      Prisma.sql`UPDATE metering_history_progress SET namespace=${namespace} WHERE migration_id=${historyMigrationId}`,
    );
    await historyBudgets(sql, namespace, true);
  }
  const cutoverAt = new Date(progress.snapshot_at).toISOString();
  const sources = await sql.query<{ source_id: string; payload: unknown }>(
    Prisma.sql`SELECT source_id,payload FROM metering_legacy_usage_source WHERE source_id>${progress.cursor} ORDER BY source_id LIMIT ${batchSize}`,
  );
  const preparedNamespaces = new Set([namespace]);
  for (const row of sources) {
    const source = decode<LegacyUsageSource>(row.payload);
    const proofs = await historyProofs(sql, row.source_id);
    const operation = await historicalTarget(sql, source, namespace, cutoverAt, proofs);
    if (!preparedNamespaces.has(operation.scope.namespace)) {
      await historyBudgets(sql, operation.scope.namespace, true);
      preparedNamespaces.add(operation.scope.namespace);
    }
    const result = await importHistoricalEvidence(sql, {
      migrationId: historyMigrationId,
      sourceId: row.source_id,
      sourceHash: historySourceHash(source, proofs),
      operation,
      cutoverAt,
    });
    if (result.outcome !== "imported")
      throw new Error("Historical source or target mapping conflict");
    await translateReferences(sql, row.source_id, operation);
    await sql.execute(
      Prisma.sql`UPDATE metering_history_progress SET cursor=${row.source_id} WHERE migration_id=${historyMigrationId}`,
    );
  }
  if (sources.length === 0) {
    await verifyHistoricalImport(sql);
    await sql.execute(
      Prisma.sql`UPDATE metering_history_progress SET verified_at=now() WHERE migration_id=${historyMigrationId}`,
    );
  }
  return { done: sources.length === 0, processed: sources.length };
}
async function translateReferences(
  sql: Sql,
  sourceId: string,
  operation: import("@usagekit/core").Operation,
) {
  const references = await sql.query<{ kind: string; reference_id: string; payload: unknown }>(
    Prisma.sql`SELECT kind,reference_id,payload FROM metering_legacy_reference_source WHERE source_id=${sourceId} ORDER BY kind,reference_id`,
  );
  for (const reference of references) {
    const body = {
      schemaVersion: 1,
      namespace: operation.scope.namespace,
      principal: operation.scope.principal,
      operationId: operation.operationId,
      receiptId: effective(operation)?.id ?? null,
      legacy: reference.payload,
    };
    await sql.execute(Prisma.sql`INSERT INTO metering_history_reference(kind,reference_id,source_id,namespace,operation_id,principal,receipt_id,body)
      VALUES(${reference.kind},${reference.reference_id},${sourceId},${operation.scope.namespace},${operation.operationId},${operation.scope.principal},${effective(operation)?.id ?? null},${encode(body)}::jsonb)
      ON CONFLICT(kind,reference_id) DO NOTHING`);
    await migrateAiReference(sql, reference.kind, reference.reference_id, sourceId, operation);
  }
}
