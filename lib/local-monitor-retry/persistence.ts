import "server-only";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { MonitorRetrySelection } from "./selection";

export async function persistMonitorRetry(
  tx: LocalTransaction,
  jobId: string,
  selection: MonitorRetrySelection,
  now: Date,
) {
  const { parent, approval, members } = selection;
  await tx.$executeRaw`INSERT INTO local_monitor_retry_selections(id,"projectId","monitorId","parentRunId","parentOccurrenceId","definitionRevisionId","scheduleIntentId","parentExpectedCount","sourceHash","selectedProofHash","createdAt") VALUES (${jobId},${parent.run.projectId},${parent.occurrence.monitorId},${parent.run.id},${parent.occurrence.id},${parent.revision.id},${parent.occurrence.scheduleIntentId},${approval.parentExpectedCount},${approval.sourceHash},${approval.selectedProofHash},${now})`;
  for (const { row, proof } of members)
    await tx.$executeRaw`INSERT INTO local_monitor_retry_members("selectionId","projectId","parentItemId","targetId","targetKey","recordVersion","recordSnapshot","nativeState","nativeProof") VALUES (${jobId},${parent.run.projectId},${row.item.id},${row.stored.id},${row.stored.targetKey},${row.item.version},${JSON.stringify(row.record)}::jsonb,${proof.financialState},${proof.nativeProof})`;
}

export async function assertPersistedMonitorRetry(
  tx: LocalTransaction,
  jobId: string,
  selection: MonitorRetrySelection,
) {
  const rows = await tx.$queryRaw<
    Array<{ parentRunId: string; sourceHash: string; selectedProofHash: string }>
  >`SELECT "parentRunId","sourceHash","selectedProofHash" FROM local_monitor_retry_selections WHERE id=${jobId} AND "projectId"=${selection.parent.run.projectId}`;
  const members = await tx.$queryRaw<
    Array<{ parentItemId: string; targetId: string; recordSnapshot: unknown }>
  >`SELECT "parentItemId","targetId","recordSnapshot" FROM local_monitor_retry_members WHERE "selectionId"=${jobId} AND "projectId"=${selection.parent.run.projectId} ORDER BY "targetId"`;
  const expected = selection.members
    .map(({ row }) => ({
      parentItemId: row.item.id,
      targetId: row.stored.id,
      recordSnapshot: row.record,
    }))
    .sort((a, b) => (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0));
  if (
    rows.length !== 1 ||
    rows[0].parentRunId !== selection.parent.run.id ||
    rows[0].sourceHash !== selection.approval.sourceHash ||
    rows[0].selectedProofHash !== selection.approval.selectedProofHash ||
    localDigest(members) !== localDigest(expected)
  )
    throw new LocalMonitorConflictError();
}
