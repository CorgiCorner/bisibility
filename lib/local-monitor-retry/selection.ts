import "server-only";
import { readLocalResultBinding } from "@/lib/local-monitor-results/binding";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { compareCodeUnits } from "@/lib/local-monitoring/key";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import {
  type MonitorRetryApproval,
  type MonitorRetryRequest,
  monitorRetryApprovalSchema,
} from "./input-schema";
import { readMonitorRetryProof } from "./proof";
import { monitorRetrySource } from "./source";

export async function loadMonitorRetryParent(
  tx: LocalTransaction,
  projectId: string,
  monitorId: string,
  parentRunId: string,
  asOf: Date,
) {
  await tx.$queryRaw`SELECT id FROM local_measurement_runs WHERE "projectId"=${projectId} AND "publicId"=${parentRunId} FOR SHARE`;
  await tx.$queryRaw`SELECT i.id FROM local_measurement_run_items i JOIN local_measurement_runs r ON r.id=i."runId" AND r."projectId"=i."projectId" WHERE r."projectId"=${projectId} AND r."publicId"=${parentRunId} ORDER BY i.id FOR SHARE OF i`;
  const parent = await readLocalResultBinding(tx, projectId, monitorId, parentRunId, asOf);
  const sourceHash = monitorRetrySource({
    occurrence: parent.occurrence,
    revisionHash: parent.revision.contentHash,
    runId: parent.run.id,
    publicRunId: parent.run.publicId,
    expectedTargetKeys: parent.run.expectedTargetKeys,
    members: parent.rows.map(({ stored, item }) => ({
      itemId: item.id,
      targetId: stored.publicId,
      targetKey: stored.targetKey,
    })),
  });
  return { parent, sourceHash };
}
export async function captureMonitorRetry(
  tx: LocalTransaction,
  input: {
    projectId: string;
    monitorId: string;
    retry: MonitorRetryRequest;
    revisionId: string;
    scheduleIntentId: string;
    now: Date;
  },
) {
  const { parent, sourceHash } = await loadMonitorRetryParent(
    tx,
    input.projectId,
    input.monitorId,
    input.retry.parentRunId,
    input.now,
  );
  if (
    parent.revision.id !== input.revisionId ||
    parent.occurrence.scheduleIntentId !== input.scheduleIntentId
  )
    throw new LocalMonitorConflictError();
  const selected = input.retry.targetIds.map((id) =>
    parent.rows.find((row) => row.stored.publicId === id),
  );
  if (
    !selected.length ||
    selected.some((row) => !row) ||
    new Set(input.retry.targetIds).size !== selected.length
  )
    throw new LocalMonitorConflictError();
  const members = [];
  for (const row of selected) {
    if (!row) throw new LocalMonitorConflictError();
    const proof = await readMonitorRetryProof(tx, row);
    if (!proof.eligible || !proof.nativeProof || !proof.financialState)
      throw new LocalMonitorConflictError();
    members.push({ row, proof });
  }
  members.sort((a, b) => compareCodeUnits(a.row.stored.publicId, b.row.stored.publicId));
  const approval: MonitorRetryApproval = monitorRetryApprovalSchema.parse({
    version: 1,
    parentRunId: parent.run.publicId,
    parentExpectedCount: parent.run.expectedTargetKeys.length,
    targetIds: members.map(({ row }) => row.stored.publicId),
    sourceHash,
    selectedProofHash: localDigest([
      "local-monitor-retry-proof-v1",
      members.map(({ row, proof }) => ({
        itemId: row.item.id,
        targetId: row.stored.publicId,
        targetKey: row.stored.targetKey,
        record: row.record,
        financialState: proof.financialState,
        nativeProof: proof.nativeProof,
      })),
    ]),
  });
  return {
    parent,
    members,
    approval,
    targets: members.map(({ row }) => ({
      id: row.stored.publicId,
      target: row.target,
      point: row.point,
    })),
  };
}
export async function assertMonitorRetryCurrent(
  tx: LocalTransaction,
  input: Parameters<typeof captureMonitorRetry>[1] & {
    retry: MonitorRetryApproval;
    targetIds: readonly string[];
  },
) {
  const selection = await captureMonitorRetry(tx, input);
  if (
    localDigest(selection.approval) !== localDigest(input.retry) ||
    localDigest([...input.targetIds].sort(compareCodeUnits)) !==
      localDigest(selection.approval.targetIds)
  )
    throw new LocalMonitorConflictError();
  return selection;
}
export type MonitorRetrySelection = Awaited<ReturnType<typeof captureMonitorRetry>>;
