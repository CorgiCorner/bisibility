import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { providerUsageOpsKey } from "./ops-identity";
import { finalReceiptJoin, unknownAccounting } from "./reconcile-state";

export type RecoveryNoticeState = { fingerprint: string; active: boolean; notifiedAt: string };
export type RecoveryNotice = "new" | "changed" | "digest" | "resolved" | null;
export function recoveryNotice(
  previous: RecoveryNoticeState | null,
  current: { fingerprint: string; active: boolean },
  now: Date,
): RecoveryNotice {
  if (!current.active) return previous?.active ? "resolved" : null;
  if (!previous?.active) return "new";
  if (previous.fingerprint !== current.fingerprint) return "changed";
  if (now.getTime() - Date.parse(previous.notifiedAt) >= 86400000) return "digest";
  return null;
}
export const recoveryIncidentBody = SQL.sql`CASE
  WHEN m.key LIKE 'authoritative-reconciliation-error:%'
    OR m.key LIKE 'authoritative-reconciliation-last-error:%'
  THEN m.value::jsonb ELSE '{}'::jsonb END`;

/** Age and retry counters do not change incident identity or cause repeat alerts. */
export async function planRecoveryNotice(
  tx: Prisma.TransactionClient,
  namespace: string,
  kind: "failed" | "overdue",
  count: number,
  now: Date,
) {
  const key = providerUsageOpsKey(`provider_usage_notice_${kind}`, namespace);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  const [stored] = await tx.$queryRaw<{ value: string }[]>(
    SQL.sql`SELECT value FROM metering_metadata WHERE key=${key}`,
  );
  let previous: RecoveryNoticeState | null = null;
  try {
    const value = JSON.parse(stored?.value ?? "null");
    if (value && typeof value.fingerprint === "string" && typeof value.notifiedAt === "string")
      previous = value;
  } catch {
    /* Malformed operational metadata must not suppress a fresh alert. */
  }
  const source =
    kind === "failed"
      ? SQL.sql`SELECT (${recoveryIncidentBody}->>'kind')||':'||(${recoveryIncidentBody}->>'id')||':'||(${recoveryIncidentBody}->>'code') AS identity
      FROM metering_metadata m WHERE m.key LIKE 'authoritative-reconciliation-error:%'
        AND ${recoveryIncidentBody}->>'namespace'=${namespace}`
      : SQL.sql`SELECT o.operation_id||':'||o.version::text AS identity
      FROM metering_operation o ${finalReceiptJoin}
      WHERE o.namespace=${namespace} AND ${unknownAccounting}
        AND o.created_at<=${new Date(now.getTime() - 15 * 60000)}`;
  const [snapshot] = await tx.$queryRaw<{ fingerprint: string }[]>(SQL.sql`
    SELECT md5(COALESCE(string_agg(identity,',' ORDER BY identity COLLATE "C"),'')) AS fingerprint FROM (${source}) incidents`);
  const current = { fingerprint: `${count}:${snapshot?.fingerprint ?? ""}`, active: count > 0 };
  const notice = recoveryNotice(previous, current, now);
  if (notice)
    await tx.$executeRaw`INSERT INTO metering_metadata(key,value)
    VALUES(${key},${JSON.stringify({ ...current, notifiedAt: now.toISOString() })})
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
  return { notice, fingerprint: current.fingerprint };
}
