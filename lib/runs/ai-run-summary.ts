import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import type { AiRunSummary } from "./ai-project-run";
import { AI_COST_SKIP_REASONS } from "./ai-run-state";

/** Aggregate only the selected run IDs. Canonical receipts, never forecasts, provide actual cost. */
export async function aiRunSummaries(projectId: string, runIds: string[]) {
  if (!runIds.length) return [];
  return prisma.$queryRaw<AiRunSummary[]>(Prisma.sql`
    WITH samples AS (
      SELECT s.*, COALESCE(s.receipt->'operationRef'->>'operationId', s.receipt->>'providerCostEntryId') AS operation_id
      FROM ai_tracking_samples s WHERE s."projectId"=${projectId} AND s."runId" IN (${Prisma.join(runIds)})
    ), measured_raw AS (
      SELECT s.id, s."runId", s.dispatch, s."claimedAt", u.operation_pk, u."costCents",
        (u."measurementStatus"='recorded' AND u."costCents" IS NOT NULL) AS known,
        (s.receipt->>'noDispatch'='true' AND s.receipt->>'state'='confirmed' AND s.receipt->>'amountUsd'='0'
          AND s.operation_id IS NULL AND s.dispatch='terminal' AND s."providerTaskId" IS NULL) AS unsent
      FROM samples s LEFT JOIN (${canonicalUsageSql(undefined, true)}) u
        ON u."projectId"=${projectId} AND u.id IN (s.operation_id, 'legacy:'||s.operation_id, 'hosted-attempt:'||s.operation_id)
        AND u."connectionId"=s.plan->>'credentialConnectionId'
        AND u."providerCredentialVersion"=s.plan->>'credentialVersion'
        AND (s.receipt->'operationRef' IS NULL OR s.receipt->'operationRef'='null'::jsonb
          OR (s.receipt->'operationRef'->>'version'='1' AND s.receipt->'operationRef'->>'namespace'=${meteringNamespace()}))
    ), measured AS (
      SELECT id, "runId", dispatch, "claimedAt", (ARRAY_AGG(operation_pk))[1] AS operation_pk,
        MIN("costCents") AS "costCents", COUNT(operation_pk)=1 AND BOOL_AND(known) AS known,
        BOOL_OR(unsent) AS unsent
      FROM measured_raw GROUP BY id, "runId", dispatch, "claimedAt"
    ), costs AS (
      SELECT "runId", SUM("costCents")::text AS total FROM (
        SELECT DISTINCT "runId", operation_pk, "costCents" FROM measured WHERE known
      ) distinct_operations GROUP BY "runId"
    )
    SELECT m."runId", COUNT(*)::int AS total,
      (SELECT MIN(s.evidence->>'providerStatus') FROM samples s WHERE s."runId"=m."runId" AND s.evidence->>'providerStatus' IN (${Prisma.join(AI_COST_SKIP_REASONS)})) AS reason,
      COUNT(*) FILTER (WHERE dispatch='terminal')::int AS completed,
      MIN("claimedAt") AS "startedAt", COUNT(*) FILTER (WHERE known OR unsent)::int AS known,
      CASE WHEN COUNT(*) FILTER (WHERE known OR unsent)>0 THEN COALESCE(MAX(c.total),'0') ELSE NULL END AS "costCents"
    FROM measured m LEFT JOIN costs c ON c."runId"=m."runId" GROUP BY m."runId"
  `);
}
