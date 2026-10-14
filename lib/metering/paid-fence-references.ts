import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OperationRef } from "@usagekit/core";
import type { PaidAttemptContext, PaidFenceReference } from "./paid-attempt-types";
import { createSql } from "./store/host-sql";
import { find } from "./store/records";

/** No Store initialization, cursor metadata write, wallet or operation lock before host business locks. */
export async function readPaidFenceReference(
  tx: Prisma.TransactionClient,
  ref: OperationRef,
): Promise<PaidFenceReference> {
  const retained = await find(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), ref);
  const [row] = await tx.$queryRaw<Array<{ principal: string; context: PaidAttemptContext }>>`
    SELECT principal,context FROM metering_paid_attempt_context WHERE namespace=${ref.namespace} AND operation_id=${ref.operationId}`;
  if (!retained || !retained.op.lease || !row || row.principal !== ref.principal)
    throw new Error("Original paid fence reference is unavailable.");
  return { operation: retained.op, lease: retained.op.lease, context: row.context };
}
