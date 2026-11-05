import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import type { Operation } from "@usagekit/core";

// Capability-scoped history used "rank_check"; catalog-priced queued tasks reserve the task_post.
const QUEUED_RANK_OPERATIONS = new Set(["rank_check", "serp.google.organic.task_post"]);

/**
 * Own-key queued tag proof. Current submissions attribute the exact task and omit `cs`, or set
 * `cs=own`. Hosted and legacy pre-attribution tags are not proof. `t` is the task alias.
 */
export const queuedOwnTagProofSql = SQL.sql`(strpos(t."providerTag", ';cs=own;') > 0 OR (strpos(t."providerTag", ';cs=') = 0
  AND strpos(t."providerTag", ';f=rank_check;') > 0
  AND right(t."providerTag", length(t.id) + 3) = ';c=' || t.id))`;

/**
 * Original BYOK queued proof shared by automatic and operator recovery. Own-key tags carry either
 * an explicit `cs=own` segment or, as current own-key submissions do, an attributed rank-check tag
 * for this exact task without any credential segment. Any other credential source and legacy
 * pre-attribution tags are never own-key transport evidence.
 */
export async function queuedProof(tx: Prisma.TransactionClient, operation: Operation) {
  const correlation = operation.correlationId;
  if (!correlation || !QUEUED_RANK_OPERATIONS.has(operation.operation)) return null;
  const rows = await tx.$queryRaw<
    { cost: string | null; native: string; correlation: string }[]
  >(SQL.sql`
    SELECT t."costCents"::text AS cost,t."providerTaskId" AS native,t.id AS correlation
    FROM queued_rank_check_tasks t JOIN queued_rank_check_batches b ON b.id=t."batchId"
    WHERE t.id=${correlation} AND b."connectionId"=${operation.scope.connection}
      AND b."projectId"=${operation.scope.group} AND b.provider=${operation.provider}
      AND t."providerTaskId" IS NOT NULL
      AND ${queuedOwnTagProofSql}
      AND t."costCents" IS NOT NULL`);
  if (rows.length > 1) throw new Error("Original queued proof is ambiguous");
  return rows[0] ?? null;
}
