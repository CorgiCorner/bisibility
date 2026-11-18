import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Hosted (Credits) spend in provider micro-USD for attempts created since a moment: the settled
 * cost of a settled attempt, nothing for a released one, and the full reservation for one that is
 * still open, pending or unknown (it may still cost that much). Only Credits attempts carry a
 * wallet hold, so your-key spend never counts.
 */
export async function hostedSpendMicroUsd(
  tx: Prisma.TransactionClient,
  input: { since: Date; projectId?: string },
) {
  const assistantProject = input.projectId
    ? Prisma.sql`AND r."projectId" = ${input.projectId}`
    : Prisma.empty;
  const playgroundProject = input.projectId
    ? Prisma.sql`AND a.binding->>'projectId' = ${input.projectId}`
    : Prisma.empty;
  const [row] = await tx.$queryRaw<{ micro: Prisma.Decimal | null }[]>`
    SELECT COALESCE(CEIL(SUM(attempt_spend.micro)), 0) AS micro
    FROM (
      SELECT COALESCE(a."settledMicroUsd", a."reservedMicroUsd") AS micro
      FROM assistant_attempts a JOIN assistant_runs r ON r.id = a."runId"
      WHERE a."creditHoldId" IS NOT NULL AND a."createdAt" >= ${input.since}
        AND a.status <> 'released' ${assistantProject}
      UNION ALL
      SELECT CASE
        WHEN receipt.body->>'canonicalOperationId' IS NOT NULL THEN 0
        ELSE COALESCE(
          receipt.micro,
          (a.binding->'platform'->>'estimatedProviderCents')::numeric * 10000
        )
      END AS micro
      FROM model_playground_payment_attempts a
      JOIN metering_operation o ON o.namespace = a.namespace
        AND o.operation_id = a.id AND o.principal = a.principal
      LEFT JOIN LATERAL (
        SELECT r.body, CASE WHEN r.body->'cost'->'money'->>'currency' = 'USD'
          THEN r.cost_units::numeric * power(10::numeric, 4 - r.cost_scale)
        END AS micro
        FROM metering_receipt r WHERE r.operation_pk = o.operation_pk AND o.state = 'settled'
        ORDER BY r.sequence DESC LIMIT 1
      ) receipt ON true
      WHERE a.binding->>'fundingSource' = 'platform' AND o.created_at >= ${input.since}
        AND o.state <> 'released' ${playgroundProject}
    ) attempt_spend`;
  return BigInt(row?.micro?.toFixed(0) ?? "0");
}

/** Hosted attempts that should have settled by now (or went unknown): spend nobody can see yet. */
export const UNSETTLED_GRACE_MS = 10 * 60000;

export async function unsettledHostedAttempts(
  tx: Prisma.TransactionClient,
  input: { since: Date; now: Date },
) {
  const stale = new Date(input.now.getTime() - UNSETTLED_GRACE_MS);
  const [row] = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM assistant_attempts a
    WHERE a."creditHoldId" IS NOT NULL AND a."createdAt" >= ${input.since}
      AND (a.status = 'unknown'
        OR (a.status IN ('reserved', 'dispatched', 'pending_settlement')
          AND a."updatedAt" < ${stale}))`;
  return Number(row?.count ?? 0n);
}

/** Start of the current UTC day, the window of the per-team daily cap. */
export function utcDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
