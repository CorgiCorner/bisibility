import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

export type RecoveryPreviewRow = {
  operationPk: string;
  state: string;
  fenced: boolean;
  historical: boolean;
  identityComplete: boolean;
  measuredCost: boolean;
  unknownUnits: boolean;
  nativeProven: boolean;
};
export function classifyRecoveryPreview(row: RecoveryPreviewRow) {
  if (row.state === "released") return "not_eligible_released";
  if (row.nativeProven) return "native_proven";
  if (row.historical && row.measuredCost && row.unknownUnits)
    return "measured_cost_import_unknown_units";
  if (row.historical && !row.identityComplete) return "identity_incomplete_historical_import";
  if (!row.fenced) return "not_eligible_unfenced_operator_only";
  if (!row.identityComplete) return "not_eligible_missing_identity";
  return "current_ambiguous_submission";
}

/** SET precedes every caller read; PostgreSQL rejects accidental mutations in the callback. */
export function readOnlyRecoveryTransaction<T>(
  read: (tx: Prisma.TransactionClient) => Promise<T>,
  db: PrismaClient = prisma,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return read(tx);
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}

export async function previewProviderRecovery(namespace: string, db: PrismaClient = prisma) {
  return readOnlyRecoveryTransaction(async (tx) => {
    const rows = await tx.$queryRaw<RecoveryPreviewRow[]>`
      SELECT o.operation_pk AS "operationPk", o.state,
        c.fenced_at IS NOT NULL AS fenced,
        EXISTS (SELECT 1 FROM metering_history_import h WHERE h.namespace=o.namespace AND h.operation_id=o.operation_id) AS historical,
        d."operationPk" IS NOT NULL AS "identityComplete",
        COALESCE(r.cost_certainty='measured',false) AS "measuredCost",
        EXISTS (SELECT 1 FROM metering_measurement m WHERE m.receipt_pk=r.receipt_pk AND m.certainty<>'measured') AS "unknownUnits",
        COALESCE(r.body->>'providerRequestId','')<>'' AND EXISTS (
          SELECT 1 FROM metering_usage_evidence e WHERE e.namespace=o.namespace AND NOT e.discarded
          AND e."providerRequestId"=r.body->>'providerRequestId' AND e."receiptId" IS NOT NULL
          AND e."connectionId"=o.input->'scope'->>'connection') AS "nativeProven"
      FROM metering_operation o
      LEFT JOIN metering_paid_attempt_context c ON c.namespace=o.namespace AND c.operation_id=o.operation_id
      LEFT JOIN provider_dispatch_identities d ON d."operationPk"=o.operation_pk
      LEFT JOIN LATERAL (SELECT * FROM metering_receipt rr WHERE rr.operation_pk=o.operation_pk ORDER BY rr.sequence DESC LIMIT 1) r ON true
      WHERE o.namespace=${namespace} ORDER BY o.operation_pk LIMIT 1000`;
    return {
      providerCalls: 0,
      providerAccessDenied: true,
      writes: 0,
      cases: rows.map((row) => ({
        operationPk: row.operationPk,
        classification: classifyRecoveryPreview(row),
      })),
    };
  }, db);
}
