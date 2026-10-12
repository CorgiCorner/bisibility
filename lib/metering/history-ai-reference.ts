import type { Operation } from "@usagekit/core";
import { Prisma, type Sql } from "./store/sql";

/** Called by the deploy-blocking import in its operation/reference transaction. */
export async function migrateAiReference(
  sql: Sql,
  kind: string,
  referenceId: string,
  sourceId: string,
  operation: Operation,
) {
  const table =
    kind === "ai_sample"
      ? "ai_tracking_samples"
      : kind === "ai_generation"
        ? "ai_tracking_suggestion_generations"
        : null;
  if (!table) return;
  const [exists] = await sql.query<{ found: boolean }>(
    Prisma.sql`SELECT to_regclass(${table}) IS NOT NULL AS found`,
  );
  if (!exists?.found) return;
  const reference = {
    version: 1,
    namespace: operation.scope.namespace,
    operationId: operation.operationId,
  };
  await sql.execute(Prisma.sql`UPDATE ${Prisma.raw(table)} SET receipt=(COALESCE(receipt,'{}'::jsonb)-'providerCostEntryId') || jsonb_build_object('providerCostEntryId',NULL,'operationRef',${JSON.stringify(reference)}::jsonb)
    WHERE id=${referenceId} AND "projectId"=${operation.scope.group} AND EXISTS(SELECT 1 FROM metering_legacy_reference_source s WHERE s.kind=${kind} AND s.reference_id=${referenceId} AND s.source_id=${sourceId})`);
}
