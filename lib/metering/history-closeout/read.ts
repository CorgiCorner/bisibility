import type { Prisma } from "@/lib/generated/prisma/client";

/** Authoritative retained disposition count, separate from financial uncertainty. */
export async function identityIncompleteHistoryCount(
  tx: Prisma.TransactionClient,
  namespace: string,
  project: string,
) {
  const [schema] = await tx.$queryRaw<
    { available: boolean }[]
  >`SELECT to_regclass('metering_history_closeout') IS NOT NULL AS available`;
  if (!schema?.available) return 0;
  const [row] = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) FROM metering_history_closeout h JOIN metering_operation o USING(operation_pk)
    WHERE h.namespace=${namespace} AND o.input->'scope'->>'group'=${project}`;
  if (!row || row.count > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Historical disposition count unavailable.");
  return Number(row.count);
}
