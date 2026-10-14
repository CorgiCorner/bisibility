import { recoveryIncidentBody } from "@/lib/provider-usage/recovery-notification-policy";
import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { finalReceiptJoin, unknownAccounting } from "@/lib/provider-usage/reconcile-state";
import { resultRecoveryCutoff } from "@/lib/rank-check/recovery-result-grace";
import { readRunRecoveryCoverage } from "@/lib/rank-check/recovery-run-coverage";
import type { RecoveryFilters } from "./contract";
import { readDeploymentRecoveryProof } from "./deployment-extension";
import type { RecoveryIdentity, RecoveryRecord } from "./records";
import { recoveryCaseKey, recoveryInstance } from "./tokens";
import { readUncertaintyGates } from "./uncertainty-gates";

const rankReference = SQL.sql`COALESCE(c.context->>'rankCheckId',
  CASE WHEN o.input->>'operation'='rank_check' THEN o.input->>'correlationId' END)`;
export function recoveryCasesSql(namespace: string, to: Date) {
  return SQL.sql`
    SELECT 'operation:'||o.operation_id AS key,'operation' AS kind,o.operation_id AS id,
      o.operation_id,${rankReference} AS rank_check_id,NULL::text AS run_id,
      o.version,o.state,o.created_at,o.input->'scope'->>'group' AS project_id,
      o.input->'scope'->>'connection' AS connection_id,o.input->>'provider' AS provider,
      COALESCE(c.context->>'feature',o.input->>'operation') AS feature,
      o.input->>'fundingSource' AS funding
    FROM metering_operation o ${finalReceiptJoin}
    LEFT JOIN metering_paid_attempt_context c ON c.namespace=o.namespace AND c.operation_id=o.operation_id
    WHERE o.namespace=${namespace} AND o.created_at<=${to} AND (
      ${unknownAccounting} OR EXISTS(SELECT 1 FROM rank_checks rc WHERE rc.id=${rankReference}
        AND rc.status IN ('running','deferred') AND rc."updatedAt"<(${new Date(to.getTime() - 15 * 60000)}::timestamptz AT TIME ZONE 'UTC'))
      OR EXISTS(SELECT 1 FROM rank_check_result_evidence re
        JOIN rank_checks rc ON rc.id=re."rankCheckId"
        WHERE re."rankCheckId"=${rankReference} AND re.namespace=${namespace} AND re."instanceId"=${recoveryInstance()} AND rc.status<>'completed' AND re."createdAt"<=${resultRecoveryCutoff(to)})
      OR EXISTS(SELECT 1 FROM metering_metadata m WHERE m.key LIKE 'authoritative-reconciliation-error:%'
        AND ${recoveryIncidentBody}->>'namespace'=${namespace} AND ${recoveryIncidentBody}->>'kind'='operation'
        AND ${recoveryIncidentBody}->>'id'=o.operation_id))
    UNION ALL
    SELECT 'evidence:'||e.id,'evidence',e.id,COALESCE(h.operation_id,e.id),NULL::text,NULL::text,
      e."proofVersion",'pending',e."createdAt" AT TIME ZONE 'UTC',e."projectId",e."connectionId",
      e.provider,e.feature,'byok'
    FROM metering_usage_evidence e
    LEFT JOIN metering_history_import h ON h.namespace=e.namespace AND h.source_id=e.id
      AND h.migration_id='20261011021000_accounting_history'
    WHERE e.namespace=${namespace} AND NOT e.discarded AND e."receiptId" IS NOT NULL
      AND e."createdAt"<=(${to}::timestamptz AT TIME ZONE 'UTC') AND (
        NOT EXISTS(SELECT 1 FROM metering_operation o WHERE o.namespace=e.namespace AND o.operation_id=COALESCE(h.operation_id,e.id))
        OR EXISTS(SELECT 1 FROM metering_metadata m WHERE m.key LIKE 'authoritative-reconciliation-error:%'
          AND ${recoveryIncidentBody}->>'namespace'=${namespace} AND ${recoveryIncidentBody}->>'kind'='evidence'
          AND ${recoveryIncidentBody}->>'id'=e.id))
    UNION ALL
    SELECT 'run:'||run.id,'run',run.id,NULL::text,NULL::text,run.id,run."requestedCount",
      CASE WHEN run.status='queued' AND run."claimedAt" IS NULL THEN 'queued' ELSE 'claimed' END,
      run."createdAt" AT TIME ZONE 'UTC',run."projectId",NULL::text,'unknown','rank_check',NULL::text
    FROM rank_check_runs run WHERE run.status IN ('queued','running') AND run."deletedAt" IS NULL
      AND run."createdAt"<(${new Date(to.getTime() - 15 * 60000)}::timestamptz AT TIME ZONE 'UTC')
      AND EXISTS(SELECT 1 FROM rank_check_run_items item WHERE item."runId"=run.id)
      AND NOT EXISTS(SELECT 1 FROM rank_checks rc WHERE rc."runId"=run.id)
      AND NOT EXISTS(SELECT 1 FROM metering_paid_attempt_context c WHERE c.context->>'rankCheckRunId'=run.id)
      AND NOT EXISTS(SELECT 1 FROM rank_check_run_recovery_grants g WHERE g."runId"=run.id
        AND (g.namespace<>${namespace} OR g."instanceId"<>${recoveryInstance()}))
    UNION ALL
    SELECT 'check:'||rc.id,'check',rc.id,NULL::text,rc.id,rc."runId",0,rc.status,
      rc."createdAt" AT TIME ZONE 'UTC',k."projectId",NULL::text,rc.provider,'rank_check',NULL::text
    FROM rank_checks rc JOIN keywords k ON k.id=rc."keywordId"
    WHERE rc.status IN ('running','deferred') AND rc."updatedAt"<(${new Date(to.getTime() - 15 * 60000)}::timestamptz AT TIME ZONE 'UTC')
      AND NOT EXISTS(SELECT 1 FROM metering_paid_attempt_context c WHERE c.context->>'rankCheckId'=rc.id)
      AND NOT EXISTS(SELECT 1 FROM metering_operation o WHERE o.input->>'operation'='rank_check' AND o.input->>'correlationId'=rc.id)
      AND NOT EXISTS(SELECT 1 FROM rank_check_result_evidence re WHERE re."rankCheckId"=rc.id)
      AND NOT EXISTS(SELECT 1 FROM rank_check_run_recovery_grants g WHERE g."runId"=rc."runId"
        AND (g.namespace<>${namespace} OR g."instanceId"<>${recoveryInstance()}))
    UNION ALL
    SELECT 'result:'||rc.id,'result',rc.id,NULL::text,rc.id,rc."runId",0,rc.status,
      rc."createdAt" AT TIME ZONE 'UTC',k."projectId",NULL::text,rc.provider,'rank_check',NULL::text
    FROM rank_check_result_evidence re JOIN rank_checks rc ON rc.id=re."rankCheckId"
    JOIN keywords k ON k.id=rc."keywordId" WHERE re.namespace=${namespace} AND re."instanceId"=${recoveryInstance()} AND rc.status<>'completed' AND re."createdAt"<=${resultRecoveryCutoff(to)}
      AND NOT EXISTS(SELECT 1 FROM metering_paid_attempt_context c WHERE c.namespace=${namespace}
        AND c.context->>'rankCheckId'=rc.id)
      AND NOT EXISTS(SELECT 1 FROM metering_operation o WHERE o.namespace=${namespace}
        AND o.input->>'operation'='rank_check' AND o.input->>'correlationId'=rc.id)`;
}

export async function readRecoveryRecords(
  tx: Prisma.TransactionClient,
  namespace: string,
  options: {
    to: Date;
    after?: string;
    limit?: number;
    filters?: RecoveryFilters;
    identity?: RecoveryIdentity;
  },
) {
  const conditions = [SQL.sql`TRUE`];
  if (options.after)
    conditions.push(SQL.sql`candidate.key COLLATE "C">${options.after} COLLATE "C"`);
  if (options.identity)
    conditions.push(
      SQL.sql`candidate.key=${recoveryCaseKey(options.identity.kind, options.identity.id)}`,
    );
  if (options.filters?.provider)
    conditions.push(SQL.sql`candidate.provider=${options.filters.provider}`);
  if (options.filters?.category === "accounting") conditions.push(unknownAccounting);
  if (options.filters?.category === "historical")
    conditions.push(
      SQL.sql`EXISTS(SELECT 1 FROM metering_history_import h WHERE h.namespace=${namespace} AND h.operation_id=candidate.operation_id)`,
    );
  if (options.filters?.category === "unfinished")
    conditions.push(
      SQL.sql`(candidate.kind IN ('run','result') OR (rc.id IS NOT NULL AND rc.status<>'completed'))`,
    );
  if (options.filters?.category === "failed") conditions.push(SQL.sql`error.current`);
  const rows = await tx.$queryRaw<RecoveryRecord[]>(SQL.sql`
    WITH candidates AS (${recoveryCasesSql(namespace, options.to)})
    SELECT candidate.key,candidate.kind,candidate.id,${namespace}::text AS namespace,
      candidate.version,candidate.provider,candidate.feature,candidate.funding,
      candidate.project_id AS "projectId",p."publicId" AS "projectPublicId",
      candidate.connection_id AS "connectionId",pc."publicId" AS "connectionPublicId",
      rc.id AS "rankCheckId",COALESCE(candidate.run_id,rc."runId") AS "runId",
      rc.status AS "rankStatus",rc."updatedAt" AT TIME ZONE 'UTC' AS "rankUpdatedAt",
      p.id IS NOT NULL AS "projectExists",
      EXISTS(SELECT 1 FROM metering_history_import h WHERE h.namespace=${namespace} AND h.operation_id=candidate.operation_id) AS historical,
      COALESCE(${unknownAccounting},candidate.kind='evidence') AS "accountingUnknown",
      r.body->>'providerRequestId' AS "nativeId",c.operation_id IS NOT NULL AS binding,
      c.fenced_at IS NOT NULL AS fenced,candidate.state,o.lease_expires_at AS "leaseExpiresAt",
      candidate.created_at AS "createdAt",r.body AS receipt,
      (candidate.kind='evidence' OR EXISTS(SELECT 1 FROM metering_usage_evidence e
        LEFT JOIN metering_history_import h ON h.namespace=e.namespace AND h.source_id=e.id
          AND h.migration_id='20261011021000_accounting_history'
        WHERE e.namespace=${namespace} AND NOT e.discarded AND e."receiptId" IS NOT NULL
          AND COALESCE(h.operation_id,e.id)=candidate.operation_id)
        OR EXISTS(SELECT 1 FROM queued_rank_check_tasks t JOIN queued_rank_check_batches b ON b.id=t."batchId"
          WHERE t.id=o.input->>'correlationId' AND b."connectionId"=candidate.connection_id
            AND b."projectId"=candidate.project_id AND b.provider=candidate.provider
            AND t."providerTaskId" IS NOT NULL AND t."costCents" IS NOT NULL AND t."providerTag" LIKE '%;cs=own;%')) AS proof,
      re."expiresAt" AS "resultExpiresAt",re."blockedCode" AS "resultBlockedCode",error.body AS error,COALESCE(error.current,false) AS "activeError",
      EXISTS(SELECT 1 FROM rank_check_run_recovery_grants grant_row
        JOIN rank_check_runs grant_run ON grant_run.id=grant_row."runId"
        JOIN users grant_actor ON grant_actor.id=grant_row."actorId"
        WHERE grant_row."runId"=candidate.run_id AND grant_row.namespace=${namespace}
          AND grant_row."instanceId"=${recoveryInstance()} AND grant_row."validUntil">${options.to}
          AND grant_row."ownerId"=p."ownerId" AND grant_row."actorId"=grant_run."requestedById"
          AND grant_actor."deactivatedAt" IS NULL AND p."writeMode"='active'
          AND grant_run."claimedAt" IS NULL AND grant_run."orchestrationWorkflowId" IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM rank_check_run_items item WHERE item."runId"=grant_run.id
            AND (item."rankCheckId" IS NOT NULL OR item.status<>'queued'))) AS "resumeAuthorized",
      triage.version AS "triageVersion",triage."basisHash" AS "triageBasis",triage.status AS "triageStatus",
      triage.reason AS "triageReason",triage."assigneeId" AS "assigneeId",triage."snoozedUntil" AS "snoozedUntil"
    FROM candidates candidate
    LEFT JOIN metering_operation o ON o.namespace=${namespace} AND o.operation_id=candidate.operation_id
    ${finalReceiptJoin}
    LEFT JOIN metering_paid_attempt_context c ON c.namespace=o.namespace AND c.operation_id=o.operation_id
    LEFT JOIN projects p ON p.id=candidate.project_id
    LEFT JOIN provider_connections pc ON pc.id=candidate.connection_id
    LEFT JOIN rank_checks rc ON rc.id=candidate.rank_check_id AND EXISTS(
      SELECT 1 FROM keywords k WHERE k.id=rc."keywordId" AND k."projectId"=candidate.project_id)
    LEFT JOIN rank_check_result_evidence re ON re."rankCheckId"=rc.id AND re.namespace=${namespace} AND re."instanceId"=${recoveryInstance()} AND re."createdAt"<=${resultRecoveryCutoff(options.to)}
    LEFT JOIN metering_recovery_triage triage ON triage.namespace=${namespace} AND triage."caseKey"=candidate.key
    LEFT JOIN LATERAL (
      SELECT ${recoveryIncidentBody} AS body,key LIKE 'authoritative-reconciliation-error:%' AS current
      FROM metering_metadata m WHERE ${recoveryIncidentBody}->>'namespace'=${namespace}
        AND ${recoveryIncidentBody}->>'kind'=candidate.kind AND ${recoveryIncidentBody}->>'id'=candidate.id
        AND (m.key LIKE 'authoritative-reconciliation-error:%' OR m.key LIKE 'authoritative-reconciliation-last-error:%')
      ORDER BY current DESC LIMIT 1
    ) error ON TRUE
    WHERE ${SQL.join(conditions, " AND ")}
    ORDER BY candidate.key COLLATE "C" LIMIT ${Math.min(51, options.limit ?? 51)}`);
  for (const row of rows)
    if (row.funding === "platform") {
      const proof = await readDeploymentRecoveryProof(tx, namespace, row.id);
      row.proof = proof.available;
      if (proof.accepted && !row.nativeId) row.nativeId = "retained-native-proof";
    }
  for (const row of rows)
    if (row.kind === "run" && row.resumeAuthorized && row.runId) {
      row.originalAuthorization = await readRunRecoveryCoverage(tx, row.runId);
      if (!row.originalAuthorization) row.resumeAuthorized = false;
    }
  const gates = await readUncertaintyGates(tx, namespace);
  for (const row of rows)
    row.spendingBlocked = {
      project: gates.projects.has(row.projectId),
      connection: gates.connections.has(row.connectionId),
    };
  return rows;
}
