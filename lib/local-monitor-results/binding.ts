import "server-only";
import { readRetainedMonitorRetry } from "@/lib/local-monitor-retry/retained";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { localDigest, localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { readOccurrenceDefinition } from "@/lib/local-monitoring-store/occurrence-definition";
import { retainedLocalPoint } from "@/lib/local-monitoring-store/point";
import { executionTargetSchema, submissionRecordSchema } from "@/lib/local-monitoring-store/schema";
import { LocalResultUnavailableError } from "./errors";
/** Verify the complete original Cartesian set, or an explicitly retained retry subset. */
export async function readLocalResultBinding(
  tx: LocalTransaction,
  projectId: string,
  monitorId: string,
  runId: string,
  asOf: Date,
) {
  const monitor = await tx.localMonitor.findFirst({
    where: { projectId, publicId: monitorId },
    select: { id: true },
  });
  const run = await tx.localMeasurementRun.findFirst({
    where: { projectId, publicId: runId, createdAt: { lte: asOf } },
  });
  if (!monitor || !run) throw new LocalResultUnavailableError();
  const captured = await readOccurrenceDefinition(tx, projectId, run.id);
  if (captured.occurrence.monitorId !== monitor.id || captured.occurrence.createdAt > asOf)
    throw new LocalResultUnavailableError();
  const { definition } = captured;
  const retry = await readRetainedMonitorRetry(tx, projectId, run.id);
  const expected = retry
    ? retry.targetKeys.length
    : definition.keywords.length * definition.grid.points.length;
  if (
    retry &&
    (retry.approval.parentExpectedCount < expected ||
      retry.targetKeys.some((key) => !run.expectedTargetKeys.includes(key)))
  )
    throw new LocalResultUnavailableError();
  if (
    !expected ||
    expected > 100 ||
    run.expectedTargetKeys.length !== expected ||
    new Set(run.expectedTargetKeys).size !== expected
  )
    throw new LocalResultUnavailableError();
  const items = await tx.localMeasurementRunItem.findMany({
    where: { projectId, runId: run.id },
    orderBy: { operationKey: "asc" },
    take: 101,
  });
  const targets = await tx.localMeasurementTarget.findMany({
    where: { projectId, id: { in: items.map((item) => item.targetId) } },
  });
  const points = await tx.localMeasurementPoint.findMany({
    where: { projectId, id: { in: targets.map((target) => target.pointId) } },
  });
  const byTarget = new Map(targets.map((row) => [row.id, row])),
    byPoint = new Map(points.map((row) => [row.id, row]));
  const keys = new Set<string>();
  const rows = items.map((item) => {
    const stored = byTarget.get(item.targetId),
      storedPoint = stored ? byPoint.get(stored.pointId) : null;
    if (!stored || !storedPoint) throw new LocalResultUnavailableError();
    const target = executionTargetSchema.parse(stored.target),
      point = retainedLocalPoint(storedPoint.point),
      record = submissionRecordSchema.parse(item.record);
    const keyword = definition.keywords.find((value) => value.id === target.keywordId),
      gridPoint = definition.grid.points.find(
        (value) => value.point.revisionKey === target.pointRevision,
      );
    if (
      !keyword ||
      !gridPoint ||
      target.projectId !== projectId ||
      target.keywordRevision !== localKeywordRevision(keyword) ||
      target.policyRevision !== captured.revision.id ||
      localDigest(point) !== localDigest(gridPoint.point) ||
      stored.keywordSourceHash !== keyword.sourceHash ||
      executionTargetKey(target) !== stored.targetKey ||
      !run.expectedTargetKeys.includes(stored.targetKey) ||
      keys.has(stored.targetKey) ||
      record.targetKey !== stored.targetKey ||
      record.key !== item.operationKey ||
      record.scope.projectId !== projectId ||
      record.version !== item.version ||
      localDigest(target) !==
        localDigest({
          version: 1,
          projectId,
          keywordId: keyword.id,
          keywordRevision: localKeywordRevision(keyword),
          pointRevision: point.revisionKey,
          policyRevision: captured.revision.id,
          ...definition.axes,
        })
    )
      throw new LocalResultUnavailableError();
    keys.add(stored.targetKey);
    return { item, target, point, record, stored, keyword, gridPoint };
  });
  if (rows.length !== expected || keys.size !== expected) throw new LocalResultUnavailableError();
  return { ...captured, run, rows, ...(retry ? { retry } : {}) };
}
export type LocalResultBinding = Awaited<ReturnType<typeof readLocalResultBinding>>;
