import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { providerUsageOpsKey } from "./ops-identity";
import { actionableUnknownAccounting, finalReceiptJoin } from "./reconcile-state";

export type RecoveryNoticeState = {
  fingerprint: string;
  active: boolean;
  notifiedAt: string;
  /** Incident count; older stored states carry it only as the fingerprint prefix. */
  count?: number;
  /** Distinct failed kinds and codes; absent for the overdue kind and older stored states. */
  causes?: string[];
};
export type RecoveryNoticeInput = {
  fingerprint: string;
  active: boolean;
  count?: number;
  causes?: string[];
};
export type RecoveryNotice = "new" | "changed" | "digest" | "resolved" | null;

function storedCount(state: Pick<RecoveryNoticeState, "count" | "fingerprint">) {
  if (typeof state.count === "number" && Number.isFinite(state.count)) return state.count;
  const prefix = Number.parseInt(state.fingerprint.split(":", 1)[0] ?? "", 10);
  return Number.isFinite(prefix) ? prefix : null;
}

/** A new failed kind or code appeared; dropping one while incidents resolve is not a change. */
function newCause(previous: RecoveryNoticeState, current: RecoveryNoticeInput) {
  if (!previous.causes || !current.causes) return false;
  const known = new Set(previous.causes);
  return current.causes.some((cause) => !known.has(cause));
}

/**
 * Re-alerts only on more incidents or a new failure cause. A shrinking backlog, such as bulk
 * resolution of historical batches, updates the stored state silently; the daily digest and the
 * resolution notice are unchanged.
 */
export function recoveryNotice(
  previous: RecoveryNoticeState | null,
  current: RecoveryNoticeInput,
  now: Date,
): RecoveryNotice {
  if (!current.active) return previous?.active ? "resolved" : null;
  if (!previous?.active) return "new";
  if (previous.fingerprint !== current.fingerprint) {
    const before = storedCount(previous);
    const after = storedCount(current);
    if (before === null || after === null || after > before || newCause(previous, current))
      return "changed";
  }
  if (now.getTime() - Date.parse(previous.notifiedAt) >= 86400000) return "digest";
  return null;
}

/** The state to persist after a decision, or null when nothing changed. */
export function nextRecoveryNoticeState(
  previous: RecoveryNoticeState | null,
  current: RecoveryNoticeInput,
  notice: RecoveryNotice,
  now: Date,
): RecoveryNoticeState | null {
  const stored = { ...current, count: storedCount(current) ?? 0 };
  if (notice) return { ...stored, notifiedAt: now.toISOString() };
  if (!previous || previous.fingerprint === current.fingerprint) return null;
  // Silent update: keep the last notification time so the 24-hour digest still fires.
  return { ...stored, notifiedAt: previous.notifiedAt };
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
    if (value && typeof value.fingerprint === "string" && typeof value.notifiedAt === "string") {
      const causes = Array.isArray(value.causes)
        ? value.causes.filter((cause: unknown): cause is string => typeof cause === "string")
        : undefined;
      previous = {
        active: value.active === true,
        fingerprint: value.fingerprint,
        notifiedAt: value.notifiedAt,
        ...(typeof value.count === "number" ? { count: value.count } : {}),
        ...(causes ? { causes } : {}),
      };
    }
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
      WHERE o.namespace=${namespace} AND ${actionableUnknownAccounting}
        AND o.created_at<=${new Date(now.getTime() - 15 * 60000)}`;
  const [snapshot] = await tx.$queryRaw<{ fingerprint: string }[]>(SQL.sql`
    SELECT md5(COALESCE(string_agg(identity,',' ORDER BY identity COLLATE "C"),'')) AS fingerprint FROM (${source}) incidents`);
  const causes =
    kind === "failed"
      ? (
          await tx.$queryRaw<{ cause: string | null }[]>(SQL.sql`
    SELECT DISTINCT (${recoveryIncidentBody}->>'kind')||':'||(${recoveryIncidentBody}->>'code') AS cause
    FROM metering_metadata m WHERE m.key LIKE 'authoritative-reconciliation-error:%'
      AND ${recoveryIncidentBody}->>'namespace'=${namespace}`)
        )
          .map((row) => row.cause ?? "unknown")
          .sort()
      : undefined;
  const current = {
    fingerprint: `${count}:${snapshot?.fingerprint ?? ""}`,
    active: count > 0,
    count,
    ...(causes ? { causes } : {}),
  };
  const notice = recoveryNotice(previous, current, now);
  const next = nextRecoveryNoticeState(previous, current, notice, now);
  if (next)
    await tx.$executeRaw`INSERT INTO metering_metadata(key,value)
    VALUES(${key},${JSON.stringify(next)})
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
  return { notice, fingerprint: current.fingerprint };
}
