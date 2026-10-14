import "server-only";
import { fencePaidAttemptsInTransaction } from "@/lib/metering/paid-dispatch";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { ownTransportRef } from "@/lib/metering/transport-own-admission";
import type { OwnAttemptGrant } from "@/lib/provider-usage/admission-extension-types";
import type { LocalTransaction } from "./context";

/** Reuses canonical paid business/accounting locks and lease protocol. */
export async function fenceLocalGrant(tx: LocalTransaction, grant: OwnAttemptGrant) {
  const meter = await createTransactionMeter(tx);
  const operation = await readPaidOperation(meter, await ownTransportRef(tx, grant.attemptId));
  if (!operation.lease || operation.lease.leaseId !== grant.leaseId)
    throw new Error("Original paid grant is fenced out.");
  await fencePaidAttemptsInTransaction(tx, [{ operation, lease: operation.lease }]);
}
