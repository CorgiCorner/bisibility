import "server-only";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { compareCodeUnits } from "@/lib/local-monitoring/key";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { readOccurrenceDefinition } from "@/lib/local-monitoring-store/occurrence-definition";
import { monitorRetryApprovalSchema } from "./input-schema";
import { monitorRetrySource } from "./source";

type Header = {
  id: string;
  projectId: string;
  monitorId: string;
  parentRunId: string;
  parentOccurrenceId: string;
  definitionRevisionId: string;
  scheduleIntentId: string;
  parentExpectedCount: number;
  sourceHash: string;
  selectedProofHash: string;
  command: unknown;
};
type Member = {
  parentItemId: string;
  targetId: string;
  targetKey: string;
  publicId: string;
  recordVersion: number;
  recordSnapshot: unknown;
  nativeState: string;
  nativeProof: string;
};
/** Retained lineage is independent of today's parent status. Fresh purchase checks live proof separately. */
export async function readRetainedMonitorRetry(
  tx: LocalTransaction,
  projectId: string,
  runId: string,
) {
  const rows = await tx.$queryRaw<
    Header[]
  >`SELECT s.*,j.command FROM local_monitor_retry_selections s JOIN local_monitor_launch_intents j ON j.id=s.id AND j."projectId"=s."projectId" WHERE j."projectId"=${projectId} AND j."runId"=${runId}`;
  if (!rows.length) return null;
  if (rows.length !== 1) throw new LocalMonitorConflictError();
  const header = rows[0];
  const command = header.command;
  if (
    !command ||
    typeof command !== "object" ||
    Array.isArray(command) ||
    !("retry" in command) ||
    !("targetIds" in command)
  )
    throw new LocalMonitorConflictError();
  const approval = monitorRetryApprovalSchema.parse(command.retry);
  const parent = await tx.localMeasurementRun.findFirst({
    where: { projectId, id: header.parentRunId },
  });
  const child = await tx.localMeasurementRun.findFirst({ where: { projectId, id: runId } });
  const captured = await readOccurrenceDefinition(tx, projectId, header.parentRunId);
  const childCapture = await readOccurrenceDefinition(tx, projectId, runId);
  if (
    !parent ||
    !child ||
    parent.id === child.id ||
    captured.occurrence.createdAt > childCapture.occurrence.createdAt ||
    header.parentOccurrenceId !== captured.occurrence.id ||
    header.monitorId !== captured.occurrence.monitorId ||
    childCapture.occurrence.monitorId !== header.monitorId ||
    childCapture.revision.id !== header.definitionRevisionId ||
    captured.revision.id !== header.definitionRevisionId ||
    captured.occurrence.scheduleIntentId !== header.scheduleIntentId ||
    childCapture.occurrence.scheduleIntentId !== header.scheduleIntentId ||
    approval.parentRunId !== parent.publicId ||
    approval.parentExpectedCount !== parent.expectedTargetKeys.length ||
    approval.parentExpectedCount !== header.parentExpectedCount ||
    approval.sourceHash !== header.sourceHash ||
    approval.selectedProofHash !== header.selectedProofHash
  )
    throw new LocalMonitorConflictError();
  const members = await tx.$queryRaw<
    Member[]
  >`SELECT m.*,t."publicId" FROM local_monitor_retry_members m JOIN local_measurement_targets t ON t.id=m."targetId" AND t."projectId"=m."projectId" WHERE m."selectionId"=${header.id} AND m."projectId"=${projectId} ORDER BY t."publicId" COLLATE "C"`;
  members.sort((a, b) => compareCodeUnits(a.publicId, b.publicId));
  const original = await tx.$queryRaw<
    Array<{ itemId: string; targetId: string; targetKey: string; internalTargetId: string }>
  >`SELECT i.id AS "itemId",t."publicId" AS "targetId",t."targetKey",t.id AS "internalTargetId" FROM local_measurement_run_items i JOIN local_measurement_targets t ON t.id=i."targetId" AND t."projectId"=i."projectId" WHERE i."projectId"=${projectId} AND i."runId"=${parent.id}`;
  const sourceHash = monitorRetrySource({
    occurrence: captured.occurrence,
    revisionHash: captured.revision.contentHash,
    runId: parent.id,
    publicRunId: parent.publicId,
    expectedTargetKeys: parent.expectedTargetKeys,
    members: original.map(({ itemId, targetId, targetKey }) => ({ itemId, targetId, targetKey })),
  });
  if (
    sourceHash !== header.sourceHash ||
    original.length !== header.parentExpectedCount ||
    localDigest(members.map((m) => m.publicId)) !==
      localDigest([...approval.targetIds].sort(compareCodeUnits)) ||
    localDigest(command.targetIds) !==
      localDigest([...approval.targetIds].sort(compareCodeUnits)) ||
    localDigest([...child.expectedTargetKeys].sort(compareCodeUnits)) !==
      localDigest(members.map((m) => m.targetKey).sort(compareCodeUnits)) ||
    members.some(
      (m) =>
        !original.some(
          (o) =>
            o.itemId === m.parentItemId &&
            o.internalTargetId === m.targetId &&
            o.targetKey === m.targetKey,
        ),
    ) ||
    localDigest([
      "local-monitor-retry-proof-v1",
      members.map((m) => ({
        itemId: m.parentItemId,
        targetId: m.publicId,
        targetKey: m.targetKey,
        record: m.recordSnapshot,
        financialState: m.nativeState,
        nativeProof: m.nativeProof,
      })),
    ]) !== header.selectedProofHash
  )
    throw new LocalMonitorConflictError();
  return {
    approval,
    targetKeys: members.map((m) => m.targetKey),
    targetIds: members.map((m) => m.publicId),
  };
}
