import type { Prisma } from "@/lib/generated/prisma/client";
import { createSql, Prisma as SQL } from "@/lib/metering/store/host-sql";
import { closeoutPolicy, historyMigration, liveConnectionCloseoutPolicy } from "./manifest";

export type CloseoutCandidateQuery = {
  namespace: string;
  /** Exactly one: an existing project's public ID or a deleted project's internal ID. */
  projectPublicId?: string;
  retiredProjectId?: string;
  connection: string;
  after?: string;
};

/**
 * Read-only manifest-building aid for one project and connection. It narrows to untouched
 * known-cost original imports; the digest-bound preview still rechecks every eligibility rule.
 */
export async function listCloseoutCandidates(
  tx: Prisma.TransactionClient,
  query: CloseoutCandidateQuery,
) {
  await createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }).verifyTimestampContract();
  if ((query.projectPublicId === undefined) === (query.retiredProjectId === undefined))
    throw new Error("Select exactly one existing or retired project.");
  const project = query.retiredProjectId
    ? (await tx.project.count({ where: { id: query.retiredProjectId } }))
      ? null
      : { id: query.retiredProjectId }
    : await tx.project.findUnique({
        where: { publicId: query.projectPublicId },
        select: { id: true },
      });
  if (!project)
    throw new Error("An exact existing project, or an absent retired project, is required.");
  const live = await tx.providerConnection.count({ where: { id: query.connection } });
  const [schema] = await tx.$queryRaw<
    { available: boolean }[]
  >`SELECT to_regclass('metering_history_closeout') IS NOT NULL AS available`;
  const unclosed = schema?.available
    ? SQL.sql`AND NOT EXISTS(SELECT 1 FROM metering_history_closeout c WHERE c.operation_pk=o.operation_pk)`
    : SQL.empty;
  const rows = await tx.$queryRaw<
    {
      operationId: string;
      expectedVersion: number;
      receiptId: string;
      costUsdUnits: string;
      createdAt: Date;
    }[]
  >(SQL.sql`SELECT o.operation_id AS "operationId",o.version AS "expectedVersion",
      r.receipt_id AS "receiptId",r.cost_units::text AS "costUsdUnits",o.created_at AS "createdAt"
    FROM metering_operation o
    JOIN metering_history_import h ON h.namespace=o.namespace AND h.operation_id=o.operation_id
      AND h.migration_id=${historyMigration} AND h.created_operation
    JOIN metering_receipt r ON r.operation_pk=o.operation_pk AND r.sequence=0
    WHERE o.namespace=${query.namespace} AND o.state='pending' AND o.version=1
      AND o.input->'scope'->>'group'=${project.id} AND o.input->'scope'->>'connection'=${query.connection}
      AND o.input->>'provider'='historical-unknown' AND o.input->>'fundingSource'='byok'
      AND r.cost_certainty='measured' AND r.cost_units IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM metering_receipt later WHERE later.operation_pk=o.operation_pk AND later.sequence>0)
      ${unclosed}
      AND o.operation_id COLLATE "C">${query.after ?? ""} COLLATE "C"
    ORDER BY o.operation_id COLLATE "C" LIMIT 101`);
  // A retired project whose connection still exists qualifies under no policy: list nothing.
  const ineligible = Boolean(query.retiredProjectId && live);
  const operations = ineligible ? [] : rows.slice(0, 100);
  return {
    projectPublicId: query.projectPublicId ?? null,
    retiredProjectId: query.retiredProjectId ?? null,
    connection: query.connection,
    policy: ineligible ? null : live ? liveConnectionCloseoutPolicy : closeoutPolicy,
    ineligible: ineligible ? "retired_project_requires_retired_connection" : null,
    operations: operations.map((row) => ({
      operationId: row.operationId,
      expectedVersion: row.expectedVersion,
      receiptId: row.receiptId,
      costUsdUnits: row.costUsdUnits,
      createdAt: row.createdAt.toISOString(),
    })),
    totalCostUsdUnits: operations
      .reduce((sum, row) => sum + BigInt(row.costUsdUnits), 0n)
      .toString(),
    nextAfter: !ineligible && rows.length > 100 ? (operations.at(-1)?.operationId ?? null) : null,
  };
}
