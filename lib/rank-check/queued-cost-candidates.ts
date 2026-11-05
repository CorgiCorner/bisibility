import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { queuedOwnTagProofSql } from "@/lib/provider-usage/queued-proof";
import {
  actionableUnknownAccounting,
  finalReceiptJoin,
} from "@/lib/provider-usage/reconcile-state";

export type QueuedCostCandidate = {
  taskId: string;
  providerTaskId: string;
  connectionId: string;
  projectId: string;
  envelope: string | null;
  retainedVersion: string | null;
  incident: boolean;
  evidence: unknown;
};

/**
 * Terminal own-key tasks that were accepted but have no recorded cost while their original
 * operation is still unknown. Live tasks settle through the result path, hosted tasks never match.
 */
export async function queuedCostCandidates(
  client: Pick<PrismaClient, "$queryRaw">,
  namespace: string,
  now: Date,
  limit: number,
) {
  // An ambiguous correlation is never guessed (the reconciler reports it as a proof conflict), and
  // it is dropped before the limit so it can never occupy the batch. Rows that were deferred sort
  // behind untouched ones, so one stuck task cannot starve the others.
  return client.$queryRaw<QueuedCostCandidate[]>(SQL.sql`
    SELECT c.* FROM (SELECT t.id AS "taskId",t."providerTaskId" AS "providerTaskId",b."connectionId" AS "connectionId",
      b."projectId" AS "projectId",c."credentialsEncrypted" AS envelope,
      p.context->>'providerCredentialVersion' AS "retainedVersion",t."costEvidence" AS evidence,
      EXISTS(SELECT 1 FROM provider_account_incidents i WHERE i."connectionId"=b."connectionId"
        AND i."resolvedAt" IS NULL AND i."credentialVersion"=p.context->>'providerCredentialVersion') AS incident,
      t."createdAt" AS "createdAt",count(*) OVER (PARTITION BY t.id) AS matches
    FROM metering_operation o ${finalReceiptJoin}
    JOIN queued_rank_check_tasks t ON t.id=o.input->>'correlationId'
    JOIN queued_rank_check_batches b ON b.id=t."batchId"
    JOIN provider_connections c ON c.id=b."connectionId" AND c."projectId"=b."projectId"
    LEFT JOIN metering_paid_attempt_context p ON p.namespace=o.namespace AND p.operation_id=o.operation_id
    WHERE o.namespace=${namespace} AND o.input->>'fundingSource'='byok' AND o.input->>'provider'='dataforseo'
      AND o.input->>'operation' IN ('rank_check','serp.google.organic.task_post')
      AND o.input->'scope'->>'connection'=b."connectionId" AND o.input->'scope'->>'group'=b."projectId"
      AND ${actionableUnknownAccounting}
      AND b.provider='dataforseo' AND c.provider='dataforseo' AND c."credentialSource"='own'
      AND t."providerTaskId" IS NOT NULL AND t."costCents" IS NULL AND ${queuedOwnTagProofSql}
      AND t.state IN ('failed','deferred')
      AND (t."persistenceLeaseExpiresAt" IS NULL OR t."persistenceLeaseExpiresAt"<=${now})
      AND (t."costEvidence" IS NULL OR (t."costEvidence"->>'status'='retry'
        AND (t."costEvidence"->>'nextAt')::timestamptz<=${now}))
    ) c WHERE c.matches=1
    ORDER BY COALESCE((c.evidence->>'nextAt')::timestamptz,'epoch'::timestamptz),c."createdAt",c."taskId"
    LIMIT ${limit}`);
}
