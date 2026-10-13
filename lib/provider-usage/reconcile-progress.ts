import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { createSql, lock, Prisma as SQL } from "@/lib/metering/store/host-sql";
import { recoverCandidate } from "./reconcile-recovery";
import { reconciliationHealth, recoveryCandidates } from "./reconcile-state";

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
          return recovered;
        },
        { timeout: 30000 },
      );
    } catch {
      // Recovery rolled back. Retain an incident and advance this scan without
      // changing the failed operation; the next scan will retry its proof.
      await client.$transaction(async (tx) => {
        const current = await progress(tx, key, now);
        if (current.cutoff !== planned.position.cutoff || current.after >= candidate.cursor) return;
        const incident = JSON.stringify({
          namespace,
          kind: candidate.kind,
          id: candidate.id,
          failedAt: now.toISOString(),
          scanCutoff: current.cutoff,
        });
        await tx.$executeRaw(
          SQL.sql`INSERT INTO metering_metadata(key,value) VALUES(${failureKey},${incident}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        );
        await save(tx, key, { ...current, after: candidate.cursor });
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
      await tx.$executeRaw(SQL.sql`DELETE FROM metering_metadata
        WHERE key LIKE 'authoritative-reconciliation-error:%'
          AND value::jsonb->>'namespace'=${namespace}
          AND value::jsonb->>'scanCutoff' IS DISTINCT FROM ${current.cutoff}`);
    }
    const [failures] = await tx.$queryRaw<{ failed: bigint }[]>(SQL.sql`
      SELECT count(*) AS failed FROM metering_metadata
      WHERE key LIKE 'authoritative-reconciliation-error:%' AND value::jsonb->>'namespace'=${namespace}`);
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
    return { hasMore, lastReconciledAt, reconciled, scanned: page.length, failed, ...health };
  });
}
