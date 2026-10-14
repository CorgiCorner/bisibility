import "server-only";

import { type LocalMeasurementRunItem, Prisma } from "@/lib/generated/prisma/client";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { createPointRevision } from "@/lib/local-monitoring/geometry";
import { validateSubmissionOutcome } from "@/lib/local-monitoring/submission-state";
import { executionTargetSchema } from "@/lib/local-monitoring/target-key";
import { persistObservationItems } from "./persist-items";
import { projectionFingerprint } from "./projection-fingerprint";
import type { LocalObservationRunInput } from "./types";

type CustodyPort = (tx: Prisma.TransactionClient, item: LocalMeasurementRunItem) => Promise<void>;

/** Internal worker port: host accounting proof is required and this function never performs transport. */
export async function persistNeutralObservation(
  tx: Prisma.TransactionClient,
  params: {
    projectId: string;
    itemId: string;
    input: LocalObservationRunInput;
    assertAccountingRecorded: CustodyPort;
  },
) {
  await tx.$queryRaw`SELECT id FROM local_measurement_run_items WHERE id=${params.itemId} AND "projectId"=${params.projectId} FOR UPDATE`;
  const item = await tx.localMeasurementRunItem.findFirst({
    where: { id: params.itemId, projectId: params.projectId },
  });
  if (!item) throw new Error("Neutral observation custody is unavailable.");
  const targetRow = await tx.localMeasurementTarget.findFirst({
    where: { id: item.targetId, projectId: params.projectId },
  });
  if (!targetRow) throw new Error("Neutral observation target is unavailable.");
  const target = executionTargetSchema.parse(targetRow.target);
  const point = await tx.localMeasurementPoint.findFirst({
    where: { id: targetRow.pointId, projectId: params.projectId },
  });
  const coordinate = (
    point?.point as { coordinate?: { latitude?: unknown; longitude?: unknown } } | undefined
  )?.coordinate;
  if (
    !point ||
    !coordinate ||
    typeof coordinate.latitude !== "string" ||
    typeof coordinate.longitude !== "string"
  )
    throw new Error("Neutral observation point is unavailable.");
  const canonicalPoint = createPointRevision({
    revisionId: point.id,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  });
  if (
    point.revisionKey !== canonicalPoint.revisionKey ||
    point.contentHash !== canonicalPoint.contentHash ||
    target.pointRevision !== canonicalPoint.revisionKey ||
    coordinate.latitude !== canonicalPoint.coordinate.latitude ||
    coordinate.longitude !== canonicalPoint.coordinate.longitude ||
    coordinate.latitude !== params.input.configuredScope.coordinates.latitude ||
    coordinate.longitude !== params.input.configuredScope.coordinates.longitude
  )
    throw new Error("Neutral observation point does not match its immutable revision.");
  const record = item.record as unknown as SubmissionRecord;
  if (
    !record.outcome ||
    !record.attemptId ||
    !record.settlementRecorded ||
    !["accepted", "unknown_acceptance"].includes(record.status)
  )
    throw new Error("Recorded accounting and accepted task evidence are required.");
  validateSubmissionOutcome(record.outcome);
  if (
    !record.outcome.taskIds.length ||
    record.attemptId !== item.preparedAttemptId ||
    record.targetKey !== targetRow.targetKey ||
    record.provider !== item.provider ||
    record.version !== item.version
  )
    throw new Error("Neutral observation custody changed.");
  await params.assertAccountingRecorded(tx, item);
  const { input } = params;
  if (
    target.projectId !== params.projectId ||
    target.surface !== input.surface ||
    input.provider !== item.provider ||
    input.engine !== target.engine ||
    input.requestPolicy.surface !== target.surface ||
    input.requestPolicy.pointRevisionId !== point.id ||
    input.configuredScope.pointRevisionId !== point.id ||
    input.requestPolicy.policyRevision !== target.policyRevision ||
    input.requestPolicy.cutoff !== target.cutoff ||
    input.requestPolicy.depth !== target.cutoff ||
    input.requestPolicy.zoom !== target.zoom ||
    input.configuredScope.device !== target.device ||
    input.configuredScope.language !== target.language ||
    input.configuredScope.zoom !== target.zoom
  )
    throw new Error("Neutral observation does not match its frozen target.");
  if (!Number.isFinite(input.executedAt.getTime()))
    throw new Error("Neutral observation execution time is invalid.");
  for (const itemInput of input.items) {
    if (
      itemInput.resultKind !== target.resultKind ||
      (itemInput.cid != null && typeof itemInput.cid !== "string") ||
      (itemInput.placeId != null && typeof itemInput.placeId !== "string")
    )
      throw new Error("Neutral observation item is invalid.");
  }
  // Diagnostic raw is excluded from the immutable normalized projection and its replay identity.
  const normalized = {
    ...input,
    items: input.items.map(({ rawFragment: _raw, ...entry }) => entry),
  };
  const projectionHash = projectionFingerprint(normalized);
  const previous = await tx.observationRun.findUnique({
    where: { neutralExecutionItemId: item.id },
  });
  if (previous) {
    const policy = previous.requestPolicy as Record<string, unknown>;
    if (previous.projectId !== params.projectId || policy.projectionHash !== projectionHash)
      throw new Error("Neutral observation replay changed its evidence.");
    return { evidenceId: previous.id };
  }
  const saved = await tx.observationRun.create({
    data: {
      projectId: params.projectId,
      neutralExecutionItemId: item.id,
      rankCheckId: null,
      provider: input.provider,
      engine: input.engine,
      surface: input.surface,
      requestPolicy: { ...input.requestPolicy, projectionHash } as Prisma.InputJsonValue,
      configuredScope: input.configuredScope as Prisma.InputJsonValue,
      effectiveScope: input.effectiveScope ?? Prisma.DbNull,
      completeness: input.completeness,
      executedAt: input.executedAt,
    },
  });
  await persistObservationItems(tx, saved.id, input.items, false);
  return { evidenceId: saved.id };
}
