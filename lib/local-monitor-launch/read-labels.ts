import "server-only";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { z } from "zod";

const labelSchema = z.object({
  targetId: z.string(),
  keyword: z.string(),
  ordinal: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  latitude: z.string(),
  longitude: z.string(),
});
/** Labels come from the occurrence's immutable definition, including deleted keyword tombstones. */
export async function readOccurrenceLabels(tx: LocalTransaction, projectId: string, runId: string) {
  const rows = await tx.$queryRaw<unknown[]>`SELECT t."publicId" AS "targetId",
  r.snapshot#>>ARRAY['keywords',k.ordinal::text,'text'] AS keyword,
  p.ordinal,p.row,p."column",point.point#>>'{coordinate,latitude}' AS latitude,point.point#>>'{coordinate,longitude}' AS longitude
  FROM local_monitor_occurrences o
  JOIN local_monitor_revisions r ON r.id=o."definitionRevisionId" AND r."projectId"=o."projectId"
  JOIN local_measurement_runs run ON run.id=o."runId" AND run."projectId"=o."projectId"
  JOIN local_measurement_run_items item ON item."runId"=run.id AND item."projectId"=run."projectId"
  JOIN local_measurement_targets t ON t.id=item."targetId" AND t."projectId"=item."projectId"
  JOIN local_monitor_grid_points p ON p."revisionId"=r.id AND p."projectId"=r."projectId" AND p."pointId"=t."pointId"
  JOIN local_measurement_points point ON point.id=p."pointId" AND point."projectId"=p."projectId"
  JOIN local_monitor_keywords k ON k."revisionId"=r.id AND k."projectId"=r."projectId"
    AND r.snapshot#>>ARRAY['keywords',k.ordinal::text,'id']=t.target->>'keywordId'
    AND ((r.snapshot#>>ARRAY['keywords',k.ordinal::text,'measurementTargetEpoch'])||':'||
      (r.snapshot#>>ARRAY['keywords',k.ordinal::text,'measurementPolicyEpoch']))=t.target->>'keywordRevision'
    AND t.target->>'policyRevision'=r.id
  WHERE o."projectId"=${projectId} AND run."publicId"=${runId} ORDER BY k.ordinal,p.ordinal LIMIT 101`;
  const labels = rows.map((row) => labelSchema.parse(row));
  if (
    !labels.length ||
    labels.length > 100 ||
    new Set(labels.map((row) => row.targetId)).size !== labels.length
  )
    throw new LocalMeasurementUnavailableError();
  return labels;
}
