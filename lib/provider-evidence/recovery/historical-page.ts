import { closedUnknownAccounting } from "@/lib/provider-usage/uncertainty-closeout-state";
import { deploymentRecoveryInventory } from "./historical-extension";
import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { providerRecoveryScope } from "./scope";

export const historicalCursorSchema = z.object({
  version: z.literal(1),
  cutoff: z.iso.datetime(),
  complete: z.boolean(),
  nextScanAt: z.iso.datetime().nullable(),
  after: z
    .object({
      priority: z.number().int().min(0).max(1),
      urgency: z.iso.datetime(),
      key: z.string().max(4096),
    })
    .nullable(),
});
export type HistoricalCursor = z.infer<typeof historicalCursorSchema>;
export type HistoricalRecoveryRow = {
  key: string;
  source: string;
  operationPk: string | null;
  rankCheckId: string | null;
  occurredAt: Date;
  urgency: Date;
  priority: number;
  identityComplete: boolean;
  fenced: boolean;
  fixture: boolean;
  attemptedProviders: string[];
  feature: string | null;
  status: string | null;
  position: number | null;
  measuredCost: boolean;
  unknownUnits: boolean;
};

/** Every source is inventoried once or explicitly overlaps a canonical operation. */
export async function historicalRecoveryPage(
  tx: Prisma.TransactionClient,
  cursor: HistoricalCursor,
  limit: number,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Historical recovery page must be bounded to 1..100");
  const scope = providerRecoveryScope(),
    cutoff = new Date(cursor.cutoff);
  const after = cursor.after;
  const page = after
    ? Prisma.sql`WHERE (priority,urgency,key COLLATE "C") > (${after.priority},${new Date(after.urgency)},${after.key} COLLATE "C")`
    : Prisma.empty;
  return tx.$queryRaw<HistoricalRecoveryRow[]>(Prisma.sql`
    WITH inventory AS (
      SELECT 'o:'||o.operation_pk AS key,'operation'::text AS source,o.operation_pk AS "operationPk",
        COALESCE(d."rankCheckId",c.context->>'rankCheckId') AS "rankCheckId",o.created_at AS "occurredAt",
        COALESCE(d."createdAt",o.created_at)+interval '30 days' AS deadline,
        d."operationPk" IS NOT NULL AS "identityComplete",c.fenced_at IS NOT NULL AS fenced,
        COALESCE(p."isSample",false) AS fixture,ARRAY[COALESCE(d.provider,o.input->>'provider','unknown')] AS "attemptedProviders",
        o.input->>'operation' AS feature,rc.status,rc.position,
        COALESCE(r.cost_certainty='measured',false) AS "measuredCost",
        r.receipt_pk IS NULL OR EXISTS(SELECT 1 FROM metering_measurement m WHERE m.receipt_pk=r.receipt_pk AND (m.certainty<>'measured' OR m.value IS NULL)) AS "unknownUnits"
      FROM metering_operation o
      LEFT JOIN provider_dispatch_identities d ON d."operationPk"=o.operation_pk AND d."instanceId"=${scope.instanceId}
      LEFT JOIN metering_paid_attempt_context c ON c.namespace=o.namespace AND c.operation_id=o.operation_id
      LEFT JOIN rank_checks rc ON rc.id=COALESCE(d."rankCheckId",c.context->>'rankCheckId')
      LEFT JOIN keywords k ON k.id=rc."keywordId"
      LEFT JOIN projects p ON p.id=COALESCE(o.input->'scope'->>'group',k."projectId")
      LEFT JOIN LATERAL (SELECT * FROM metering_receipt rr WHERE rr.operation_pk=o.operation_pk ORDER BY sequence DESC LIMIT 1) r ON true
      WHERE o.namespace=${scope.namespace} AND o.created_at<=${cutoff} AND NOT ${closedUnknownAccounting}
        AND NOT EXISTS(SELECT 1 FROM provider_dispatch_identities foreign_identity WHERE foreign_identity."operationPk"=o.operation_pk AND foreign_identity."instanceId"<>${scope.instanceId})
      UNION ALL
      SELECT 'j:'||j.id,'orphan_journal',NULL,NULL,j."createdAt",NULL,false,false,COALESCE(p."isSample",false),ARRAY[j.provider],j.feature,NULL,NULL,j.receipt->>'costCents' IS NOT NULL,j.receipt->>'quantity' IS NULL
      FROM metering_usage_evidence j LEFT JOIN projects p ON p.id=j."projectId"
      WHERE j.namespace=${scope.namespace} AND j."createdAt"<=${cutoff} AND NOT j.discarded
        AND NOT EXISTS(SELECT 1 FROM metering_operation o WHERE o.namespace=j.namespace AND o.operation_id=j.id)
        AND NOT EXISTS(SELECT 1 FROM metering_history_import h WHERE h.namespace=j.namespace AND h.source_id=j.id)
      UNION ALL
      SELECT 'c:'||rc.id,'orphan_check',NULL,rc.id,rc."checkedAt",NULL,false,false,p."isSample",
        ARRAY(SELECT DISTINCT a->>'provider' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rc.attempts)='array' THEN rc.attempts ELSE '[]'::jsonb END) a WHERE jsonb_typeof(a->'provider')='string'),
        'rank_check',rc.status,rc.position,false,true
      FROM rank_checks rc JOIN keywords k ON k.id=rc."keywordId" JOIN projects p ON p.id=k."projectId"
      WHERE rc."checkedAt"<=${cutoff} AND jsonb_typeof(rc.attempts)='array' AND jsonb_array_length(CASE WHEN jsonb_typeof(rc.attempts)='array' THEN rc.attempts ELSE '[]'::jsonb END)>0
        AND NOT EXISTS(SELECT 1 FROM metering_paid_attempt_context c WHERE c.namespace=${scope.namespace} AND c.context->>'rankCheckId'=rc.id)
        AND NOT EXISTS(SELECT 1 FROM provider_dispatch_identities d WHERE d."namespace"=${scope.namespace} AND d."rankCheckId"=rc.id)
      UNION ALL
      SELECT 'r:'||r."rankCheckId",'retained_result',NULL,r."rankCheckId",r."createdAt",r."expiresAt",false,false,p."isSample",ARRAY[rc.provider],'rank_check',rc.status,rc.position,false,true
      FROM rank_check_result_evidence r JOIN rank_checks rc ON rc.id=r."rankCheckId" JOIN keywords k ON k.id=rc."keywordId" JOIN projects p ON p.id=k."projectId"
      WHERE r.namespace=${scope.namespace} AND r."instanceId"=${scope.instanceId} AND r."createdAt"<=${cutoff}
      UNION ALL
      SELECT 'p:'||e.id,'partial_result',NULL,e."rankCheckId",e."createdAt",e."expiresAt",false,false,p."isSample",ARRAY[rc.provider],'rank_check',rc.status,rc.position,false,true
      FROM provider_partial_evidence e JOIN rank_checks rc ON rc.id=e."rankCheckId" JOIN keywords k ON k.id=rc."keywordId" JOIN projects p ON p.id=k."projectId"
      WHERE e.namespace=${scope.namespace} AND e."instanceId"=${scope.instanceId} AND e."createdAt"<=${cutoff}
      ${deploymentRecoveryInventory(scope, cutoff)}
    ), ordered AS (
      SELECT *,CASE WHEN source='operation' AND "identityComplete" AND deadline>${cutoff} THEN 0 ELSE 1 END AS priority,
        COALESCE(deadline,"occurredAt") AS urgency FROM inventory
    ) SELECT key,source,"operationPk","rankCheckId","occurredAt",urgency,priority,"identityComplete",fenced,fixture,"attemptedProviders",feature,status,position,"measuredCost","unknownUnits"
    FROM ordered ${page} ORDER BY priority,urgency,key COLLATE "C" LIMIT ${limit}`);
}
export function classifyHistoricalRecovery(row: HistoricalRecoveryRow) {
  if (row.fixture) return "fixture";
  if (row.status === "completed" && row.position === null && (!row.operationPk || row.measuredCost))
    return "complete_negative_rank";
  if (row.source !== "operation")
    return row.source === "orphan_check" ? "attempted_provider_identity_gap" : row.source;
  if (!row.identityComplete)
    return row.measuredCost ? "identity_only_gap" : "original_identity_unavailable";
  if (!row.fenced) return "unfenced_operator_only";
  return row.status === "completed" ? "accounting_only" : "recovery_candidate";
}
