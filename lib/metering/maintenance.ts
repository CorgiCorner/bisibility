import "server-only";
import { prisma } from "@/lib/db/prisma";
import { syncUsageEntry } from "./entry-sync";
import { meteringNamespace, meteringRuntime } from "./runtime";
import { Prisma } from "./store/sql";

let running = false;
type Position = { id: string; createdAt: Date };
let sweep: { namespace: string; cutoff: Date; after?: Position } | undefined;
export async function maintainMeteringShadow() {
  if (running || process.env.METERING_SHADOW !== "on") return;
  running = true;
  try {
    const { meter } = await meteringRuntime();
    const namespace = meteringNamespace();
    await meter.expireReservations({ namespace });
    if (!sweep || sweep.namespace !== namespace) {
      const cutoff = new Date();
      sweep = { namespace, cutoff };
    }
    const after = sweep.after;
    // Retained accounting proofs survive business deletion; uncertain dimensions stay uncertain.
    const rows = await prisma.$queryRaw<Position[]>(Prisma.sql`
      SELECT e.id,e."createdAt" FROM metering_usage_evidence e
      JOIN instance_settings s ON s.key='metering.shadow.project.' || e."projectId" AND s.value='on'
      WHERE e.namespace IS NOT NULL AND e."receiptId" IS NOT NULL AND NOT e.discarded
        AND e."createdAt"<=${sweep.cutoff}
        ${after ? Prisma.sql`AND (e."createdAt",e.id)>(${after.createdAt},${after.id})` : Prisma.empty}
        AND NOT EXISTS (
          SELECT 1 FROM metering_operation o JOIN LATERAL (
            SELECT receipt_id,body FROM metering_receipt WHERE operation_pk=o.operation_pk
            ORDER BY sequence DESC LIMIT 1
          ) r ON TRUE LEFT JOIN metering_import i ON i.import_id=r.body->>'evidenceRef'
          WHERE o.namespace=e.namespace AND o.principal=e.principal AND o.operation_id=e.id
            AND (r.receipt_id=e."receiptId" OR (
              r.body->>'source'='import' AND i.namespace=e.namespace AND i.principal=e.principal
              AND i.connection=e."connectionId" AND i.provider=e.provider
              AND i.body->>'id'=i.import_id AND i.body->'matchedOperationIds' ? o.operation_id
              AND i.body->'scope'->>'namespace'=e.namespace AND i.body->'scope'->>'principal'=e.principal
              AND i.body->'scope'->>'connection'=e."connectionId" AND i.body->>'provider'=e.provider
              AND o.input->'scope'->>'connection'=e."connectionId" AND o.input->>'provider'=e.provider
              AND e."createdAt">=i.window_from AND e."createdAt"<i.window_to
              AND r.body->>'providerRequestId'=e."providerRequestId"
              AND (r.receipt_id=i.import_id || ':native:' || e."receiptId" OR EXISTS (
                SELECT 1 FROM metering_receipt native WHERE native.operation_pk=o.operation_pk
                  AND native.receipt_id=e."receiptId" AND native.body->>'source' IS DISTINCT FROM 'import'
              ))
            )))
      ORDER BY e."createdAt",e.id LIMIT 100`);
    for (const row of rows) await syncUsageEntry(row.id);
    // Advance even when synchronization failed safely, so old failures cannot starve later receipts.
    if (rows.length === 100) sweep.after = rows.at(-1);
    else sweep = undefined;
  } catch {
    console.warn("[metering] maintenance failed");
  } finally {
    running = false;
  }
}
