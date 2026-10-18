import type { Prisma } from "@/lib/generated/prisma/client";
import { currentBudgets, historicalBudget, matchingScopes } from "@/lib/metering/store/budgets";
import { canonical, decode, hash, key } from "@/lib/metering/store/codec";
import { createSql } from "@/lib/metering/store/host-sql";
import { hydrate, operationRow } from "@/lib/metering/store/records";
import { queuedProof } from "@/lib/provider-usage/queued-proof";
import type { Budget, Operation } from "@usagekit/core";
import type { HistoricalResolution } from "./manifest";

export type ImportJournal = {
  source_id: string;
  source_hash: string;
  target_hash: string;
  created_operation: boolean;
  body: unknown;
};
export type StoredCommand = { kind: string; input_hash: string; input: unknown; result: unknown };
export type HistorySnapshot = {
  identity: {
    database: string;
    schema: string;
    server: string | null;
    port: number | null;
    role: string;
    sessionRole: string;
  };
  entries: {
    operation: Operation;
    journal: ImportJournal;
    leaseKind: string | null;
    binding: boolean;
    nativeProof: boolean;
    budgets: Budget[];
    command: StoredCommand | null;
  }[];
};
export const resolutionCommandId = (manifestHash: string, id: string) =>
  `history-resolution:${hash(canonical([manifestHash, id]))}`;
export async function readHistoricalResolutionSnapshot(
  tx: Prisma.TransactionClient,
  manifest: HistoricalResolution,
  manifestHash: string,
): Promise<HistorySnapshot> {
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  await sql.verifyTimestampContract();
  const [identity] = await tx.$queryRaw<
    HistorySnapshot["identity"][]
  >`SELECT current_database() AS database,current_schema() AS schema,inet_server_addr()::text AS server,inet_server_port() AS port,current_user AS role,session_user AS "sessionRole"`;
  if (!identity) throw new Error("Database identity is unavailable.");
  const entries: HistorySnapshot["entries"] = [];
  for (const item of manifest.operations) {
    const row = await operationRow(sql, manifest.namespace, item.operationId);
    if (!row) throw new Error("Historical operation is unavailable in this namespace.");
    const operation = await hydrate(sql, row);
    const journals = await tx.$queryRaw<
      ImportJournal[]
    >`SELECT source_id,source_hash,target_hash,created_operation,body FROM metering_history_import WHERE namespace=${manifest.namespace} AND operation_id=${item.operationId} AND migration_id='20261011021000_accounting_history'`;
    const [journal] = journals;
    if (journals.length !== 1 || !journal)
      throw new Error("A unique original historical import is required.");
    const [facts] = await tx.$queryRaw<{ binding: boolean; nativeProof: boolean }[]>`SELECT
   EXISTS(SELECT 1 FROM metering_paid_attempt_context WHERE namespace=${manifest.namespace} AND operation_id=${item.operationId}) AS binding,
   EXISTS(SELECT 1 FROM metering_usage_evidence e WHERE e.namespace=${manifest.namespace} AND e.id=${journal.source_id} AND NOT e.discarded AND e."receiptId" IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM metering_receipt r WHERE r.operation_pk=${key(manifest.namespace, item.operationId)} AND r.receipt_id=e."receiptId")) AS "nativeProof"`;
    if (!facts) throw new Error("Historical evidence status is unavailable.");
    const budgets = await currentBudgets(sql, manifest.namespace, matchingScopes(operation));
    for (const epoch of operation.budgetEpochs) {
      const old = await historicalBudget(
        sql,
        manifest.namespace,
        epoch.budgetId,
        epoch.budgetVersion,
      );
      if (!budgets.some((b) => b.id === old.id && b.version === old.version)) budgets.push(old);
    }
    const [command] = await tx.$queryRaw<
      StoredCommand[]
    >`SELECT kind,input_hash,input,result FROM metering_command WHERE operation_pk=${key(manifest.namespace, item.operationId)} AND command_id=${resolutionCommandId(manifestHash, item.operationId)}`;
    entries.push({
      operation,
      journal,
      leaseKind: row.lease_kind,
      ...facts,
      nativeProof: facts.nativeProof || Boolean(await queuedProof(tx, operation)),
      budgets,
      command: command ?? null,
    });
  }
  return { identity, entries };
}
export function journalOperation(journal: ImportJournal) {
  const body = decode<{ input: Operation; operation: Operation }>(journal.body);
  return body;
}
