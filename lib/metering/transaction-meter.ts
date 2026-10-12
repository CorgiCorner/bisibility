import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Meter, OperationRef } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import type { Clock } from "@usagekit/store";
import { createTransactionBoundStore } from "./store/transactional";

export const paidAttemptClock: Clock = { now: () => new Date() };
export class PaidOperationUnavailableError extends Error {}
/** The caller owns transaction commit and search_path. No shadow switch or nested transaction. */
export async function createTransactionMeter(
  tx: Prisma.TransactionClient,
  clock: Clock = paidAttemptClock,
): Promise<Meter> {
  return createMeter({
    store: await createTransactionBoundStore({ transaction: tx, clock }),
    clock,
  });
}
/** Internal financial identity has already been authenticated by the server caller. */
export async function readPaidOperation(meter: Meter, ref: OperationRef) {
  const result = await meter.getOperation(
    {
      namespace: ref.namespace,
      readablePrincipals: [ref.principal],
      readableGroups: [],
      readablePools: [],
      canReadBillingDetail: true,
      canManageBudgets: false,
    },
    ref,
  );
  if (result.outcome !== "ok" || !result.value)
    throw new PaidOperationUnavailableError("Original paid operation is unavailable");
  return result.value;
}
