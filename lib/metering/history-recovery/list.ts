import type { Prisma } from "@/lib/generated/prisma/client";
import { createSql, Prisma as SQL } from "@/lib/metering/store/host-sql";

/** Bounded discovery only; preview rechecks eligibility from the complete retained history. */
export async function listHistoricalResolutions(
  tx: Prisma.TransactionClient,
  namespace: string,
  after = "",
) {
  await createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }).verifyTimestampContract();
  const rows = await tx.$queryRaw<
    {
      operationId: string;
      connection: string;
      version: number;
      receiptId: string;
      provider: string;
      costKnown: boolean;
      unitsKnown: boolean;
    }[]
  >(SQL.sql`SELECT o.operation_id AS "operationId",o.input->'scope'->>'connection' AS connection,
    o.version,r.receipt_id AS "receiptId",o.input->>'provider' AS provider,
    r.body->'cost'->>'certainty'='measured' AS "costKnown",
    EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'measurements') m
      WHERE m->>'unit'='units' AND m->>'certainty'='measured') AS "unitsKnown"
    FROM metering_operation o
    JOIN metering_history_import h ON h.namespace=o.namespace AND h.operation_id=o.operation_id
      AND h.migration_id='20261011021000_accounting_history' AND h.created_operation
    JOIN LATERAL (SELECT receipt_id,body FROM metering_receipt WHERE operation_pk=o.operation_pk
      ORDER BY sequence DESC LIMIT 1) r ON TRUE
    WHERE o.namespace=${namespace} AND o.state='pending' AND o.input->>'fundingSource'='byok'
      AND o.input->>'provider' IN ('dataforseo','serpapi')
      AND o.operation_id COLLATE "C">${after} COLLATE "C"
    ORDER BY o.operation_id COLLATE "C" LIMIT 101`);
  return {
    operations: rows.slice(0, 100),
    nextAfter: rows.length > 100 ? (rows[99]?.operationId ?? null) : null,
  };
}
