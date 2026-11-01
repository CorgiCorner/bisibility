import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";

/** Operator disposition ends attention, while the original financial state remains unknown. */
export const closedUnknownAccounting = SQL.sql`EXISTS(
  SELECT 1 FROM metering_unknown_closeout d
  JOIN metering_paid_attempt_context original
    ON original.namespace=d.namespace AND original.operation_id=d.operation_id
  WHERE d.operation_pk=o.operation_pk AND d.namespace=o.namespace AND d.operation_id=o.operation_id
    AND d.version=o.version AND d.input=o.input AND o.state='dispatch_intended' AND r.body IS NULL
    AND o.input->>'fundingSource'='byok' AND d.policy='native-byok-cost-unknown-v1'
    AND d.attempt_id=original.dispatch_lease_id AND original.fenced_at IS NOT NULL
    AND original.principal=o.principal
    AND d.credential_version=original.context->>'providerCredentialVersion'
)`;

/** Validity follows the original operation version, input, fenced attempt and receipt. */
export async function closedUnknownOperations(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  keys: string[],
) {
  if (!keys.length) return new Set<string>();
  const rows = await tx.$queryRaw<{ operation_pk: string }[]>(SQL.sql`
    SELECT o.operation_pk FROM metering_operation o
    LEFT JOIN LATERAL (SELECT body FROM metering_receipt rr WHERE rr.operation_pk=o.operation_pk
      ORDER BY sequence DESC LIMIT 1) r ON true
    WHERE o.operation_pk=ANY(${keys}::text[]) AND ${closedUnknownAccounting}`);
  return new Set(rows.map((row) => row.operation_pk));
}
