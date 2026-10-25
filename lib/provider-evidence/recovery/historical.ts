import { notificationTransaction } from "@/lib/notifications/transaction";
import type { OnRecoveryEnqueued } from "./enqueue";
import "server-only";
import { createHash } from "node:crypto";
import { captureRecoveryCandidate } from "./capture";
import {
  classifyHistoricalRecovery,
  historicalCursorSchema,
  historicalRecoveryPage,
} from "./historical-page";
import { readOnlyRecoveryTransaction } from "./preview";
import { providerRecoveryScope } from "./scope";
import type { WorkflowStopProbe } from "./sweep";
import { recoverySwitches } from "./switches";

export function historicalRecoveryKey() {
  const scope = providerRecoveryScope();
  return `provider-recovery-historical:${scope.namespace}:${scope.instanceId}`;
}
const initial = (now: Date) => ({
  version: 1 as const,
  cutoff: now.toISOString(),
  complete: false,
  after: null,
  nextScanAt: null,
});
async function loadPage(limit: number, now: Date) {
  return readOnlyRecoveryTransaction(async (tx) => {
    const row = await tx.meteringMetadata.findUnique({ where: { key: historicalRecoveryKey() } });
    const saved = row ? historicalCursorSchema.parse(JSON.parse(row.value)) : initial(now);
    const cursor =
      saved.complete && (!saved.nextScanAt || new Date(saved.nextScanAt) <= now)
        ? initial(now)
        : saved;
    const rows = cursor.complete ? [] : await historicalRecoveryPage(tx, cursor, limit);
    return { expected: row?.value ?? null, cursor, rows };
  });
}

/** Preview does not probe workflows, call providers or advance the persisted cursor. */
export async function previewHistoricalRecovery(limit = 100, now = new Date()) {
  const page = await loadPage(limit, now);
  return {
    writes: 0,
    providerCalls: 0,
    workflowCalls: 0,
    cursor: page.cursor,
    cases: page.rows.map((row) => ({ ...row, classification: classifyHistoricalRecovery(row) })),
  };
}

/** One bounded page per existing processor pass. Identity-only gaps never enqueue incidents. */
export async function sweepHistoricalRecovery(
  probe: WorkflowStopProbe,
  limit = 100,
  now = new Date(),
  onEnqueued?: OnRecoveryEnqueued,
) {
  if (!recoverySwitches().lookup) return { examined: 0 };
  const page = await loadPage(limit, now);
  if (page.cursor.complete) return { examined: 0 };
  const stops = new Map<string, Awaited<ReturnType<WorkflowStopProbe>>>();
  for (const row of page.rows) {
    const classification = classifyHistoricalRecovery(row);
    if (row.rankCheckId && ["recovery_candidate", "accounting_only"].includes(classification))
      stops.set(row.rankCheckId, await probe(row.rankCheckId).catch(() => null));
  }
  return notificationTransaction(
    async (tx) => {
      const key = historicalRecoveryKey();
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
      const current = await tx.meteringMetadata.findUnique({ where: { key } });
      if ((current?.value ?? null) !== page.expected) return { examined: 0, raced: true };
      for (const row of page.rows) {
        const classification = classifyHistoricalRecovery(row);
        const inventoryKey = `${key}:row:${createHash("sha256").update(row.key).digest("hex")}`;
        const value = JSON.stringify({
          version: 1,
          source: row.source,
          key: row.key,
          operationPk: row.operationPk,
          rankCheckId: row.rankCheckId,
          attemptedProviders: row.attemptedProviders,
          feature: row.feature,
          fixture: row.fixture,
          classification,
          measuredCost: row.measuredCost,
          unknownUnits: row.unknownUnits,
        });
        await tx.meteringMetadata.upsert({
          where: { key: inventoryKey },
          create: { key: inventoryKey, value },
          update: { value },
        });
        if (row.rankCheckId && ["recovery_candidate", "accounting_only"].includes(classification)) {
          const task = await tx.queuedRankCheckTask.findUnique({
            where: { rankCheckId: row.rankCheckId },
            include: { batch: true },
          });
          await captureRecoveryCandidate(
            tx,
            row.rankCheckId,
            {
              stopReason: stops.get(row.rankCheckId) ?? undefined,
              pollingStopped: !!task?.batch.terminalAt && task.batch.queueDeadlineAt <= now,
            },
            now,
            onEnqueued,
          );
        }
      }
      const last = page.rows.at(-1);
      const complete = page.rows.length < limit;
      const cursor = {
        ...page.cursor,
        complete,
        after: last
          ? { priority: last.priority, urgency: last.urgency.toISOString(), key: last.key }
          : page.cursor.after,
        nextScanAt: complete ? new Date(now.getTime() + 86400000).toISOString() : null,
      };
      const value = JSON.stringify(cursor);
      await tx.meteringMetadata.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      return { examined: page.rows.length, complete };
    },
    { timeout: 30000 },
  );
}
