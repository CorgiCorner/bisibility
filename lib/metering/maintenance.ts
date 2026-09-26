import "server-only";
import { prisma } from "@/lib/db/prisma";
import { syncUsageEntry } from "./entry-sync";
import { meteringNamespace, meteringRuntime } from "./runtime";
import { Prisma } from "./store/sql";

let running = false;
type Position = { id: string; createdAt: Date };
let sweep: { namespace: string; start: Date; cutoff: Date; after?: Position } | undefined;
export async function maintainMeteringShadow() {
  if (running || process.env.METERING_SHADOW !== "on") return;
  running = true;
  try {
    const { meter } = await meteringRuntime();
    const namespace = meteringNamespace();
    await meter.expireReservations({ namespace });
    if (!sweep || sweep.namespace !== namespace) {
      const cutoff = new Date();
      const start = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1));
      sweep = { namespace, start, cutoff };
    }
    const after = sweep.after;
    // Import committed fallback receipts only. Uncertain dispatched work stays in the exceptions queue.
    const rows = await prisma.$queryRaw<Position[]>(Prisma.sql`
      SELECT e.id,e."createdAt" FROM provider_cost_entries e
      JOIN instance_settings s ON s.key='metering.shadow.project.' || e."projectId" AND s.value='on'
      WHERE e."credentialSource"='own' AND e."measurementStatus"='recorded'
        AND e."createdAt">=${sweep.start} AND e."createdAt"<=${sweep.cutoff}
        ${after ? Prisma.sql`AND (e."createdAt",e.id)>(${after.createdAt},${after.id})` : Prisma.empty}
        AND NOT EXISTS(SELECT 1 FROM metering_operation o WHERE o.namespace=${namespace} AND o.operation_id=e.id)
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
