import "server-only";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import type { LocalTransaction } from "./context";
import { LocalMeasurementConflictError } from "./errors";
export type LocalItemCustody = {
  projectId: string;
  connectionId: string;
  provider: string;
  credentialVersion: string;
  correlationId: string;
  namespace: string;
  preparedAttemptId: string | null;
  preparedLeaseId: string | null;
  requestHash: string | null;
};
/** Canonical persisted Meter context, not cache state or current project ownership, proves custody. */
export async function assertLocalCustody(
  tx: LocalTransaction,
  item: LocalItemCustody,
  record: SubmissionRecord,
) {
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
      discarded: false,
    },
    select: { estimate: true },
  });
  const paid = await tx.$queryRaw<
    Array<{ leaseId: string | null; version: string | null; feature: string | null }>
  >`SELECT c.dispatch_lease_id AS "leaseId",c.context->>'providerCredentialVersion' AS version,c.context->>'feature' AS feature FROM metering_paid_attempt_context c JOIN metering_usage_evidence e ON e.namespace=c.namespace AND e.principal=c.principal AND e.id=c.operation_id WHERE e.id=${id} AND e.namespace=${item.namespace}`;
  if (
    paid.length !== 1 ||
    paid[0].leaseId !== item.preparedLeaseId ||
    paid[0].version !== item.credentialVersion ||
    paid[0].feature !== "local_scan"
  )
    throw new LocalMeasurementConflictError();
  if (!evidence || !(await ownAdmission.owns(tx, id))) throw new LocalMeasurementConflictError();
  const estimate = evidence.estimate;
  if (
    !estimate ||
    typeof estimate !== "object" ||
    Array.isArray(estimate) ||
    estimate.credentialVersion !== item.credentialVersion
  )
    throw new LocalMeasurementConflictError();
  return id;
}

export async function assertLocalPossibleSend(tx: LocalTransaction, item: LocalItemCustody) {
  const rows = await tx.$queryRaw<
    Array<{ fencedAt: Date | null }>
  >`SELECT fenced_at AS "fencedAt" FROM metering_paid_attempt_context WHERE namespace=${item.namespace} AND operation_id=${item.preparedAttemptId}`;
  if (rows.length !== 1 || !rows[0].fencedAt) throw new LocalMeasurementConflictError();
}
