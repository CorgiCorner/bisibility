import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import type { RecoveryErrorCode } from "./recovery-error";

export const reconciliationHealthKey = (namespace: string) =>
  `authoritative-reconciliation-health:${namespace}`;
export type ReconciliationHealth = {
  lastActivityAt: string;
  lastCompletedAt: string | null;
  lastCleanAt: string | null;
  failed: number;
  unconfirmed: number;
  overdue: number;
};
export type RecoveryIncident = {
  origin?: "scan" | "admin";
  namespace: string;
  kind: "evidence" | "operation";
  id: string;
  code: RecoveryErrorCode;
  firstFailedAt: string;
  failedAt: string;
  attempts: number;
  scanCutoff: string;
};

export async function writeReconciliationHealth(
  tx: Prisma.TransactionClient,
  namespace: string,
  value: Partial<ReconciliationHealth>,
) {
  await tx.$executeRaw(SQL.sql`
    INSERT INTO metering_metadata(key,value) VALUES(${reconciliationHealthKey(namespace)},${JSON.stringify(value)})
    ON CONFLICT(key) DO UPDATE SET value=(metering_metadata.value::jsonb || excluded.value::jsonb)::text`);
}

export async function retainRecoveryIncident(
  tx: Prisma.TransactionClient,
  failureKey: string,
  incident: Omit<RecoveryIncident, "firstFailedAt" | "attempts">,
) {
  await tx.$executeRaw(SQL.sql`
    INSERT INTO metering_metadata(key,value)
    VALUES(${failureKey},${JSON.stringify({ ...incident, firstFailedAt: incident.failedAt, attempts: 1 })})
    ON CONFLICT(key) DO UPDATE SET value=(excluded.value::jsonb || jsonb_build_object(
      'firstFailedAt', COALESCE(metering_metadata.value::jsonb->>'firstFailedAt', metering_metadata.value::jsonb->>'failedAt', ${incident.failedAt}),
      'attempts', COALESCE((metering_metadata.value::jsonb->>'attempts')::int,0)+1))::text`);
  const historyKey = `authoritative-reconciliation-last-error:${JSON.stringify([incident.namespace, incident.kind, incident.id])}`;
  await tx.$executeRaw(SQL.sql`
    INSERT INTO metering_metadata(key,value) SELECT ${historyKey},value FROM metering_metadata WHERE key=${failureKey}
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
}

export async function readReconciliationHealth(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  namespace: string,
): Promise<Partial<ReconciliationHealth> | null> {
  const [row] = await tx.$queryRaw<{ value: string }[]>(SQL.sql`
    SELECT value FROM metering_metadata WHERE key=${reconciliationHealthKey(namespace)}`);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Partial<ReconciliationHealth>;
  } catch {
    return null;
  }
}
