import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { createSql, lock, Prisma as SQL } from "@/lib/metering/store/host-sql";
import { recoverCandidate } from "./reconcile-recovery";
import {
  finalReceiptJoin,
  reconciliationHealth,
  recoveryCandidates,
  unknownAccounting,
} from "./reconcile-state";
import { retainRecoveryIncident, writeReconciliationHealth } from "./reconciliation-health";
import { recoveryErrorCode } from "./recovery-error";
import { recoveryIncidentBody } from "./recovery-notification-policy";

type Progress = { after: string; cutoff: string };
async function progress(tx: Prisma.TransactionClient, key: string, now: Date) {
  await lock(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), key);
  const [stored] = await tx.$queryRaw<{ cursor: string }[]>(
    SQL.sql`SELECT value AS cursor FROM metering_metadata WHERE key=${key}`,
  );
  return stored?.cursor
    ? (JSON.parse(stored.cursor) as Progress)
    : { after: "", cutoff: now.toISOString() };
}
async function save(tx: Prisma.TransactionClient, key: string, value: Progress) {
  await tx.$executeRaw(
    SQL.sql`INSERT INTO metering_metadata(key,value) VALUES(${key},${JSON.stringify(value)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  );
}
/** Each proof and its cursor commit together; a page never holds another operation's locks. */
export async function recoverPage(
  client: Pick<PrismaClient, "$transaction">,
  namespace: string,
  now: Date,
  limit: number,
  watermarkKey: string,
) {
  const key = `authoritative-reconciliation:${namespace}`;
  const planned = await client.$transaction(async (tx) => {
    const position = await progress(tx, key, now);
    const candidates = await recoveryCandidates(
      tx,
      namespace,
      new Date(position.cutoff),
      position.after,
      limit,
    );
    await save(tx, key, position);
    return { position, candidates };
  });
  const page = planned.candidates.slice(0, limit);
  let reconciled = 0;
  for (const candidate of page) {
    const failureKey = `authoritative-reconciliation-error:${JSON.stringify([namespace, candidate.cursor])}`;
    let changed = false;
    try {
      changed = await client.$transaction(
        async (tx) => {
          const current = await progress(tx, key, now);
          if (current.cutoff !== planned.position.cutoff || current.after >= candidate.cursor)
            return false;
          const recovered = await recoverCandidate(tx, namespace, candidate, now);
          await tx.$executeRaw(SQL.sql`DELETE FROM metering_metadata WHERE key=${failureKey}`);
          await save(tx, key, { ...current, after: candidate.cursor });
          await writeReconciliationHealth(tx, namespace, {
            lastActivityAt: new Date().toISOString(),
          });
          return recovered;
        },
        { timeout: 30000 },
      );
    } catch (error) {
      // Recovery rolled back. Retain an incident and advance this scan without
      // changing the failed operation; the next scan will retry its proof.
      await client.$transaction(async (tx) => {
        const current = await progress(tx, key, now);
        if (current.cutoff !== planned.position.cutoff || current.after >= candidate.cursor) return;
        await retainRecoveryIncident(tx, failureKey, {
          namespace,
          origin: "scan",
          kind: candidate.kind,
          id: candidate.id,
          code: recoveryErrorCode(error),
          failedAt: now.toISOString(),
          scanCutoff: current.cutoff,
        });
        await save(tx, key, { ...current, after: candidate.cursor });
        await writeReconciliationHealth(tx, namespace, {
          lastActivityAt: new Date().toISOString(),
        });
      });
    }
    if (changed) reconciled++;
  }
  return client.$transaction(async (tx) => {
    const current = await progress(tx, key, now);
    const expected = page.at(-1)?.cursor ?? planned.position.after;
    const hasMore =
      planned.candidates.length > limit ||
      current.cutoff !== planned.position.cutoff ||
      current.after !== expected;
    const health = await reconciliationHealth(tx, namespace, now);
    if (!hasMore) {
      // A completed scan also retires incidents resolved by another path.
      // Current failures retain this scan's cutoff and remain visible.
      await tx.$executeRaw(SQL.sql`DELETE FROM metering_metadata m
        WHERE m.key LIKE 'authoritative-reconciliation-error:%'
          AND ${recoveryIncidentBody}->>'namespace'=${namespace}
          AND COALESCE(${recoveryIncidentBody}->>'origin','scan')='scan'
          AND ${recoveryIncidentBody}->>'scanCutoff' IS DISTINCT FROM ${current.cutoff}`);
      await tx.$executeRaw(SQL.sql`DELETE FROM metering_metadata m
        WHERE m.key LIKE 'authoritative-reconciliation-error:%'
          AND ${recoveryIncidentBody}->>'namespace'=${namespace}
          AND ${recoveryIncidentBody}->>'origin'='admin'
          AND (
            (${recoveryIncidentBody}->>'kind'='operation' AND EXISTS(
              SELECT 1 FROM metering_operation o ${finalReceiptJoin}
              WHERE o.namespace=${namespace} AND o.operation_id=${recoveryIncidentBody}->>'id'
                AND NOT ${unknownAccounting}))
            OR (${recoveryIncidentBody}->>'kind'='evidence' AND EXISTS(
              SELECT 1 FROM metering_usage_evidence e
              LEFT JOIN metering_history_import h ON h.namespace=e.namespace AND h.source_id=e.id
                AND h.migration_id='20261011021000_accounting_history'
              JOIN metering_operation o ON o.namespace=e.namespace AND o.operation_id=COALESCE(h.operation_id,e.id)
              WHERE e.namespace=${namespace} AND e.id=${recoveryIncidentBody}->>'id'
                AND e."receiptId" IS NOT NULL AND EXISTS(
                  SELECT 1 FROM metering_receipt r WHERE r.operation_pk=o.operation_pk AND r.receipt_id=e."receiptId")))
          )`);
    }
    const [failures] = await tx.$queryRaw<{ failed: bigint }[]>(SQL.sql`
      SELECT count(*) AS failed FROM metering_metadata m
      WHERE m.key LIKE 'authoritative-reconciliation-error:%' AND ${recoveryIncidentBody}->>'namespace'=${namespace}`);
    const failed = Number(failures?.failed ?? 0n);
    const lastReconciledAt = hasMore || failed > 0 ? null : now.toISOString();
    if (lastReconciledAt) {
      await tx.instanceSetting.upsert({
        where: { key: watermarkKey },
        create: { key: watermarkKey, value: lastReconciledAt },
        update: { value: lastReconciledAt },
      });
    }
    if (!hasMore) await tx.$executeRaw(SQL.sql`DELETE FROM metering_metadata WHERE key=${key}`);
    await writeReconciliationHealth(tx, namespace, {
      ...(!hasMore
        ? { lastActivityAt: new Date().toISOString(), lastCompletedAt: new Date().toISOString() }
        : {}),
      ...(!hasMore && failed === 0 && health.unconfirmed === 0
        ? { lastCleanAt: new Date().toISOString() }
        : {}),
      failed,
      unconfirmed: health.unconfirmed,
      overdue: health.overdue,
    });
    return { hasMore, lastReconciledAt, reconciled, scanned: page.length, failed, ...health };
  });
}
