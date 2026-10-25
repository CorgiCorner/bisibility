import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { finalReceiptJoin, unknownAccounting } from "./reconcile-state";

/** Shared financial classifier; reading eligibility never supersedes a gate. */
export async function uncertaintyScopeUnknownCount(
  tx: Prisma.TransactionClient,
  namespace: string,
  scope: { kind: "group"; group: string } | { kind: "connection"; connection: string },
) {
  const constraint =
    scope.kind === "group"
      ? SQL.sql`o.input->'scope'->>'group'=${scope.group}`
      : SQL.sql`o.input->'scope'->>'connection'=${scope.connection}`;
  const [row] = await tx.$queryRaw<{ unknown: bigint }[]>(SQL.sql`
    SELECT count(*) AS unknown FROM metering_operation o ${finalReceiptJoin}
    WHERE o.namespace=${namespace} AND ${constraint} AND ${unknownAccounting}`);
  if (!row) throw new Error("Uncertainty scope classification unavailable");
  return row.unknown;
}
