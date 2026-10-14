import { recoveryIncidentBody } from "@/lib/provider-usage/recovery-notification-policy";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import {
  finalReceiptJoin,
  reconciliationHealth,
  unknownAccounting,
} from "@/lib/provider-usage/reconcile-state";
import { readReconciliationHealth } from "@/lib/provider-usage/reconciliation-health";
import { resultRecoveryCutoff } from "@/lib/rank-check/recovery-result-grace";
import { readResultRecoveryActivity } from "@/lib/rank-check/recovery-result-health";
import { classifyRecoveryRecord } from "./classify";
import type { RecoveryFilters, RecoveryPage } from "./contract";
import { readRecoveryRecords, recoveryCasesSql } from "./query";
import { openRecoveryCursor, recoveryInstance, sealRecoveryCursor } from "./tokens";
import { readUncertaintyGates } from "./uncertainty-gates";

export function recoveryScope(actor: string) {
  return { actor, namespace: meteringNamespace(), instance: recoveryInstance() };
}
export async function readRecoveryPage(
  actor: string,
  filters: RecoveryFilters,
  now = new Date(),
): Promise<RecoveryPage> {
  const scope = recoveryScope(actor),
    cursor = openRecoveryCursor(filters.cursor, filters, scope);
  const to = new Date(cursor?.to ?? now.toISOString());
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [health, activity, records, counts, gates, resultActivity] = await Promise.all([
        reconciliationHealth(tx, scope.namespace, now),
        readReconciliationHealth(tx, scope.namespace),
        readRecoveryRecords(tx, scope.namespace, { to, after: cursor?.after, filters }),
        recoveryCounts(tx, scope.namespace, now),
        readUncertaintyGates(tx, scope.namespace),
        readResultRecoveryActivity(tx, scope.namespace),
      ]);
      const rows = records.slice(0, 50);
      return {
        instance: process.env.SITE_URL ?? "self-host",
        namespace: scope.namespace,
        asOf: to.toISOString(),
        summary: {
          unconfirmed: health.unconfirmed,
          overdue: health.overdue,
          failed: counts.failed,
          historical: counts.historical,
          unfinished: counts.unfinished,
          retainedResults: counts.retainedResults,
          blockedScopes: { projects: gates.projects.size, connections: gates.connections.size },
          lastActivityAt: activity?.lastActivityAt ?? null,
          lastCompletedAt: activity?.lastCompletedAt ?? null,
          lastCleanAt: activity?.lastCleanAt ?? null,
          lastResultActivityAt: resultActivity,
        },
        rows: rows.map((row) => classifyRecoveryRecord(row, scope, now)),
        nextCursor: sealRecoveryCursor(
          records.length > 50 ? (rows.at(-1)?.key ?? null) : null,
          to.toISOString(),
          filters,
          scope,
        ),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
async function recoveryCounts(tx: Prisma.TransactionClient, namespace: string, now: Date) {
  const [row] = await tx.$queryRaw<
    { historical: bigint; failed: bigint; unfinished: bigint; retainedResults: bigint }[]
  >(SQL.sql`
    SELECT
      (SELECT count(DISTINCT h.operation_id) FROM metering_history_import h
        JOIN metering_operation o ON o.namespace=h.namespace AND o.operation_id=h.operation_id
        ${finalReceiptJoin}
        WHERE h.namespace=${namespace} AND ${unknownAccounting}) AS historical,
      (SELECT count(*) FROM metering_metadata m WHERE m.key LIKE 'authoritative-reconciliation-error:%'
        AND ${recoveryIncidentBody}->>'namespace'=${namespace}) AS failed,
      (SELECT count(DISTINCT COALESCE(candidate.rank_check_id,candidate.run_id))
        FROM (${recoveryCasesSql(namespace, now)}) candidate LEFT JOIN rank_checks rc ON rc.id=candidate.rank_check_id
        WHERE (candidate.kind='run' OR rc.status<>'completed')
          AND EXISTS(SELECT 1 FROM projects p WHERE p.id=candidate.project_id)) AS unfinished,
      (SELECT count(*) FROM rank_check_result_evidence e JOIN rank_checks rc ON rc.id=e."rankCheckId"
        WHERE e.namespace=${namespace} AND e."instanceId"=${recoveryInstance()} AND rc.status<>'completed' AND e."expiresAt">${now} AND e."createdAt"<=${resultRecoveryCutoff(now)}) AS "retainedResults"`);
  return {
    historical: Number(row?.historical ?? 0n),
    failed: Number(row?.failed ?? 0n),
    unfinished: Number(row?.unfinished ?? 0n),
    retainedResults: Number(row?.retainedResults ?? 0n),
  };
}
