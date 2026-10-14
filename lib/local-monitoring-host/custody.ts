import "server-only";
import { executionTargetKey, executionTargetSchema } from "@/lib/local-monitoring/target-key";
import type { OriginalLocalProofBinding } from "@/lib/local-monitoring-store/acceptance-proof";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { assertLocalCustody, assertLocalPossibleSend } from "@/lib/local-monitoring-store/custody";
import { lockedLocalItem } from "@/lib/local-monitoring-store/repository";
import { OriginalSubmitProofConflictError } from "./errors";
import {
  normalizeOriginalProofBinding,
  originalCustodySchema,
  originalProofBinding,
} from "./proof-schema";

export async function originalLocalCustody(
  tx: LocalTransaction,
  binding: OriginalLocalProofBinding,
) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${binding.projectId} FOR UPDATE`;
  const { item, record } = await lockedLocalItem(tx, binding.projectId, binding.operationKey);
  const id = await assertLocalCustody(tx, item, record);
  await assertLocalPossibleSend(tx, item);
  if (
    record.attemptId !== id ||
    !["unknown_acceptance", "accepted", "rejected"].includes(record.status)
  )
    throw new OriginalSubmitProofConflictError();
  const targetRow = await tx.localMeasurementTarget.findFirst({
    where: { projectId: item.projectId, id: item.targetId },
  });
  if (!targetRow) throw new OriginalSubmitProofConflictError();
  const target = executionTargetSchema.parse(targetRow.target);
  const native = await tx.meteringUsageEvidence.findUniqueOrThrow({ where: { id } });
  const custody = originalCustodySchema.parse({
    projectId: item.projectId,
    connectionId: item.connectionId,
    provider: item.provider,
    credentialVersion: item.credentialVersion,
    correlationId: item.correlationId,
    namespace: item.namespace,
    preparedAttemptId: item.preparedAttemptId,
    preparedLeaseId: item.preparedLeaseId,
    requestHash: item.requestHash,
    attemptId: id,
    operationKey: record.key,
    targetKey: record.targetKey,
    adapterVersion: record.adapterVersion,
    device: target.device,
    principal: native.principal,
  });
  if (
    localDigest(originalProofBinding(custody)) !==
      localDigest(normalizeOriginalProofBinding(binding)) ||
    targetRow.targetKey !== record.targetKey ||
    executionTargetKey(target) !== record.targetKey ||
    target.projectId !== item.projectId
  )
    throw new OriginalSubmitProofConflictError();
  return { item, record, target, custody };
}
