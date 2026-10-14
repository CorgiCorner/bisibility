import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";

// Both health and uncertainty gates read the final receipt, never a business projection.
export const unknownAccounting = SQL.sql`(o.state IN ('pending','dispatch_intended') OR
  (o.state='settled' AND (o.input->>'provider'='historical-unknown' OR r.body IS NULL OR
    r.body->'cost'->>'certainty' IS DISTINCT FROM 'measured' OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'measurements') m
      WHERE m->>'certainty' IS DISTINCT FROM 'measured' OR m->'quantity'='null'::jsonb))))`;
export const finalReceiptJoin = SQL.sql`LEFT JOIN LATERAL (
  SELECT body FROM metering_receipt WHERE operation_pk=o.operation_pk ORDER BY sequence DESC LIMIT 1
) r ON TRUE`;
export async function reconciliationHealth(
  tx: Prisma.TransactionClient,
  namespace: string,
  now: Date,
) {
  const [row] = await tx.$queryRaw<
    { unconfirmed: bigint; overdue: bigint; oldest: Date | null }[]
  >(SQL.sql`
    SELECT count(*) AS unconfirmed,
      count(*) FILTER(WHERE o.created_at<${new Date(now.getTime() - 15 * 60000)}) AS overdue,
      min(o.created_at) AS oldest
    FROM metering_operation o ${finalReceiptJoin}
    WHERE o.namespace=${namespace} AND ${unknownAccounting}`);
  if (!row) throw new Error("Accounting health is unavailable");
  return { unconfirmed: Number(row.unconfirmed), overdue: Number(row.overdue), oldest: row.oldest };
}
export type RecoveryCandidate = {
  cursor: string;
  kind: "evidence" | "operation";
  id: string;
  connection: string;
};
export async function recoveryCandidates(
  tx: Prisma.TransactionClient,
  namespace: string,
  cutoff: Date,
  after: string,
  limit: number,
) {
  return tx.$queryRaw<RecoveryCandidate[]>(SQL.sql`
    SELECT * FROM (
      SELECT 'e:' || e.id AS cursor,'evidence' AS kind,e.id,e."connectionId" AS connection
      FROM metering_usage_evidence e
      LEFT JOIN metering_history_import h ON h.namespace=e.namespace AND h.source_id=e.id
        AND h.migration_id='20261011021000_accounting_history'
      LEFT JOIN metering_operation o ON o.namespace=e.namespace AND o.operation_id=COALESCE(h.operation_id,e.id)
      WHERE e.namespace=${namespace} AND NOT e.discarded AND e."receiptId" IS NOT NULL
        AND e."createdAt"<=${cutoff} AND (o.operation_pk IS NULL OR NOT EXISTS(
          SELECT 1 FROM metering_receipt r WHERE r.operation_pk=o.operation_pk AND r.receipt_id=e."receiptId"))
      UNION ALL
      SELECT 'o:' || o.operation_id AS cursor,'operation' AS kind,o.operation_id,o.input->'scope'->>'connection' AS connection
      FROM metering_operation o ${finalReceiptJoin}
      WHERE o.namespace=${namespace} AND o.input->>'fundingSource'='byok'
        AND o.created_at<=${cutoff} AND ${unknownAccounting}
    ) candidates WHERE cursor COLLATE "C">${after} COLLATE "C" ORDER BY cursor COLLATE "C" LIMIT ${limit + 1}`);
}
