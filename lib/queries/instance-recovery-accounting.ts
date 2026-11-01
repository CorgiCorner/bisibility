import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { finalReceiptJoin } from "@/lib/provider-usage/reconcile-state";
import { closedUnknownAccounting } from "@/lib/provider-usage/uncertainty-closeout-state";

export type InstanceRecoveryAccounting = {
  historicalCount: number;
  historicalCostUsdUnits: string;
  closedUnknownCount: number;
};

/** Retained closeouts span all dates and survive deletion of business records. */
export function recoveryAccountingSql(namespace: string) {
  return SQL.sql`WITH history AS (
    SELECT r.cost_units FROM metering_history_closeout h
    JOIN metering_operation o ON o.operation_pk=h.operation_pk
      AND o.namespace=h.namespace AND o.operation_id=h.operation_id AND o.version=h.version
    JOIN metering_receipt r ON r.operation_pk=o.operation_pk AND r.receipt_id=h.receipt_id
    WHERE h.namespace=${namespace} AND o.state='settled'
      AND h.disposition='financially_closed_identity_incomplete'
      AND r.cost_certainty='measured' AND r.cost_units IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM metering_receipt later
        WHERE later.operation_pk=o.operation_pk AND later.sequence>r.sequence)
  ) SELECT count(*)::text AS "historicalCount",
    COALESCE(sum(cost_units),0)::text AS "historicalCostUsdUnits",
    (SELECT count(*)::text FROM metering_operation o ${finalReceiptJoin}
      WHERE o.namespace=${namespace} AND ${closedUnknownAccounting}) AS "closedUnknownCount"
    FROM history`;
}

export async function readInstanceRecoveryAccounting(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  namespace: string,
): Promise<InstanceRecoveryAccounting> {
  const [row] = await tx.$queryRaw<
    { historicalCount: string; historicalCostUsdUnits: string; closedUnknownCount: string }[]
  >(recoveryAccountingSql(namespace));
  if (!row) throw new Error("Recovery accounting unavailable");
  const historicalCount = Number(row.historicalCount);
  const closedUnknownCount = Number(row.closedUnknownCount);
  if (![historicalCount, closedUnknownCount].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Recovery accounting count unavailable");
  if (!/^\d+$/.test(row.historicalCostUsdUnits))
    throw new Error("Recovery accounting amount unavailable");
  return { ...row, historicalCount, closedUnknownCount };
}

export async function getInstanceRecoveryAccounting(): Promise<InstanceRecoveryAccounting | null> {
  try {
    return await readInstanceRecoveryAccounting(prisma, meteringNamespace());
  } catch {
    return null;
  }
}
