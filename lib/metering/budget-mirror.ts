import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Credential custody may change only after all original paid operations have final evidence. */
export async function guardConnectionFundingMutation(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  connectionId: string,
) {
  await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${connectionId} FOR UPDATE`;
  const [unresolved] = await tx.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM metering_paid_attempt_context c JOIN metering_operation o ON o.namespace=c.namespace AND o.operation_id=c.operation_id WHERE c.context->>'connectionId'=${connectionId} AND o.state IN ('reserved','dispatch_intended','pending')`;
  if (unresolved?.count && unresolved.count > 0n)
    throw new Error("Provider credential custody has unresolved paid operations");
}
