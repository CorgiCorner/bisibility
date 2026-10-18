import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import type { Prisma } from "@/lib/generated/prisma/client";
import { historyProofs } from "@/lib/metering/history-evidence";
import type { LegacyUsageSource } from "@/lib/metering/history-types";
import { currentBudgets, historicalBudget, matchingScopes } from "@/lib/metering/store/budgets";
import { decode, key } from "@/lib/metering/store/codec";
import { createSql } from "@/lib/metering/store/host-sql";
import { hydrate, operationRow } from "@/lib/metering/store/records";
import type { Operation } from "@usagekit/core";
import { type CloseoutManifest, historyMigration } from "./manifest";

export type CloseoutBody = {
  manifestHash: string;
  planHash: string;
  targetHash: string;
  finalOperation: Operation;
};
export async function closeoutSnapshot(tx: Prisma.TransactionClient, manifest: CloseoutManifest) {
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  await sql.verifyTimestampContract();
  const [identity] = await tx.$queryRaw<
    {
      database: string;
      schema: string;
      server: string | null;
      port: number | null;
      role: string;
      sessionRole: string;
    }[]
  >`
    SELECT current_database() AS database,current_schema() AS schema,inet_server_addr()::text AS server,
      inet_server_port() AS port,current_user AS role,session_user AS "sessionRole"`;
  const actor = await tx.user.findUnique({
    where: { publicId: manifest.operator },
    select: {
      id: true,
      publicId: true,
      isInstanceAdmin: true,
      emailVerified: true,
      deactivatedAt: true,
    },
  });
  const project = await tx.project.findUnique({
    where: { publicId: manifest.projectPublicId },
    select: { id: true, publicId: true },
  });
  if (!identity || !project)
    throw new Error("An exact project and database identity are required.");
  const connection = await tx.providerConnection.count({ where: { id: manifest.connection } });
  if (connection) throw new Error("Only a retired connection is eligible.");
  const [migration] = await tx.$queryRaw<
    { checksum: string; finished: boolean; verified: boolean }[]
  >`
    SELECT d.checksum,d."finishedAt" IS NOT NULL AS finished,p.verified_at IS NOT NULL AND p.namespace=${manifest.namespace} AS verified
    FROM data_migrations d JOIN metering_history_progress p ON p.migration_id=d.id WHERE d.id=${historyMigration}`;
  if (
    !migration?.finished ||
    !migration.verified ||
    migration.checksum !== dataMigrationManifest.find((m) => m.id === historyMigration)?.checksum
  )
    throw new Error("The original checked historical migration must be finalized first.");
  const [schema] = await tx.$queryRaw<
    { available: boolean }[]
  >`SELECT to_regclass('metering_history_closeout') IS NOT NULL AS available`;
  const entries = [];
  for (const item of manifest.operations) {
    const row = await operationRow(sql, manifest.namespace, item.operationId);
    if (!row) throw new Error("Original operation unavailable.");
    const operation = await hydrate(sql, row);
    const journals = await tx.$queryRaw<
      {
        source_id: string;
        source_hash: string;
        target_hash: string;
        created_operation: boolean;
        body: unknown;
        payload: unknown;
      }[]
    >`
      SELECT j.*,s.payload FROM metering_history_import j JOIN metering_legacy_usage_source s USING(source_id)
      WHERE j.namespace=${manifest.namespace} AND j.operation_id=${item.operationId} AND j.migration_id=${historyMigration}`;
    const journal = journals[0];
    if (journals.length !== 1 || !journal) throw new Error("A unique original import is required.");
    const source = decode<LegacyUsageSource>(journal.payload);
    const proofs = await historyProofs(sql, journal.source_id);
    const [facts] = await tx.$queryRaw<
      {
        binding: boolean;
        evidence: boolean;
        reference: boolean;
        retainedIdentity: boolean;
        commands: bigint;
      }[]
    >`SELECT
      EXISTS(SELECT 1 FROM metering_paid_attempt_context WHERE namespace=${manifest.namespace} AND operation_id=${item.operationId}) AS binding,
      EXISTS(SELECT 1 FROM metering_usage_evidence WHERE namespace=${manifest.namespace} AND (id=${source.id} OR id=${item.operationId} OR "canonicalId"=${item.operationId})) AS evidence,
      EXISTS(SELECT 1 FROM metering_legacy_reference_source WHERE source_id=${source.id}) OR EXISTS(SELECT 1 FROM metering_history_reference WHERE source_id=${source.id}) AS reference,
      EXISTS(SELECT 1 FROM metering_legacy_setting_source WHERE (kind='connection' AND source_id=${manifest.connection}) OR (kind='rate' AND payload->>'connectionId'=${manifest.connection})) AS "retainedIdentity",
      (SELECT count(*) FROM metering_command WHERE operation_pk=${row.operation_pk}) AS commands`;
    if (!facts) throw new Error("Evidence inventory unavailable.");
    const budgets = await currentBudgets(sql, manifest.namespace, matchingScopes(operation));
    for (const epoch of operation.budgetEpochs) {
      const budget = await historicalBudget(
        sql,
        manifest.namespace,
        epoch.budgetId,
        epoch.budgetVersion,
      );
      if (!budgets.some((b) => b.id === budget.id && b.version === budget.version))
        budgets.push(budget);
    }
    const disposition = schema?.available
      ? await tx.$queryRaw<{ body: unknown }[]>`
      SELECT body FROM metering_history_closeout WHERE operation_pk=${key(manifest.namespace, item.operationId)}`
      : [];
    entries.push({
      operation,
      journal,
      source,
      proofs,
      leaseKind: row.lease_kind,
      facts,
      budgets,
      disposition: disposition[0] ? decode<CloseoutBody>(disposition[0].body) : null,
    });
  }
  return {
    identity,
    actor,
    project,
    migration,
    schemaAvailable: schema?.available === true,
    entries,
  };
}
export type CloseoutSnapshot = Awaited<ReturnType<typeof closeoutSnapshot>>;
