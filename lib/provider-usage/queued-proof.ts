import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import type { Operation } from "@usagekit/core";

/** Original BYOK queued proof shared by automatic and operator recovery. */
export async function queuedProof(tx: Prisma.TransactionClient, operation: Operation) {
  const correlation = operation.correlationId;
  if (!correlation || operation.operation !== "rank_check") return null;
  const rows = await tx.$queryRaw<
    { cost: string | null; native: string; correlation: string }[]
  >(SQL.sql`
    SELECT t."costCents"::text AS cost,t."providerTaskId" AS native,t.id AS correlation
    FROM queued_rank_check_tasks t JOIN queued_rank_check_batches b ON b.id=t."batchId"
    WHERE t.id=${correlation} AND b."connectionId"=${operation.scope.connection}
      AND b."projectId"=${operation.scope.group} AND b.provider=${operation.provider}
      AND t."providerTaskId" IS NOT NULL AND t."providerTag" LIKE '%;cs=own;%'
      AND t."costCents" IS NOT NULL`);
  if (rows.length > 1) throw new Error("Original queued proof is ambiguous");
  return rows[0] ?? null;
}
