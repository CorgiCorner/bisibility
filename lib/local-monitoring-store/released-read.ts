import "server-only";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import type { LocalTransaction } from "./context";
import type { LocalItemCustody } from "./custody";
import { LocalMeasurementConflictError } from "./errors";
import { nativeUnsentTerminalState } from "./native-unsent-proof";
import { isUnsentLocalProjection } from "./unsent-projection";
/** Read-only retained release proof. Discarded evidence never regains active send/retrieval custody. */
export async function readDiscardedLocalRelease(
  tx: LocalTransaction,
  item: LocalItemCustody,
  record: SubmissionRecord,
): Promise<"released" | "settled" | null> {
  if (record.status !== "cancelled" || !isUnsentLocalProjection(record)) return null;
  const id = item.preparedAttemptId;
  if (
    !id ||
    !item.preparedLeaseId ||
    !item.requestHash ||
    (record.attemptId !== null && record.attemptId !== id)
  )
    throw new LocalMeasurementConflictError();
  const evidence = await tx.meteringUsageEvidence.findFirst({
    where: {
      id,
      namespace: item.namespace,
      projectId: item.projectId,
      connectionId: item.connectionId,
      provider: item.provider,
      correlationId: item.correlationId,
      discarded: true,
    },
    select: {
      principal: true,
      estimate: true,
      measurementStatus: true,
      receipt: true,
      providerRequestId: true,
      canonicalId: true,
    },
  });
  if (!evidence) return null;
  const estimate = evidence.estimate;
  if (
    record.scope.projectId !== item.projectId ||
    record.provider !== item.provider ||
    !evidence.principal ||
    evidence.measurementStatus !== "unknown" ||
    evidence.receipt !== null ||
    evidence.providerRequestId !== null ||
    evidence.canonicalId !== null ||
    !estimate ||
    typeof estimate !== "object" ||
    Array.isArray(estimate) ||
    estimate.credentialVersion !== item.credentialVersion
  )
    throw new LocalMeasurementConflictError();
  const paid = await tx.$queryRaw<
    Array<{
      leaseId: string | null;
      version: string | null;
      feature: string | null;
      fencedAt: Date | null;
    }>
  >`SELECT c.dispatch_lease_id AS "leaseId",c.context->>'providerCredentialVersion' AS version,c.context->>'feature' AS feature,c.fenced_at AS "fencedAt" FROM metering_paid_attempt_context c WHERE c.operation_id=${id} AND c.namespace=${item.namespace} AND c.principal=${evidence.principal}`;
  if (
    paid.length !== 1 ||
    paid[0].leaseId !== item.preparedLeaseId ||
    paid[0].version !== item.credentialVersion ||
    paid[0].feature !== "local_scan" ||
    paid[0].fencedAt !== null
  )
    throw new LocalMeasurementConflictError();
  const operation = await readPaidOperation(await createTransactionMeter(tx), {
    namespace: item.namespace,
    principal: evidence.principal,
    operationId: id,
  });
  return nativeUnsentTerminalState(tx, operation);
}
