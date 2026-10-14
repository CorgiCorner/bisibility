import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createPointRevision } from "@/lib/local-monitoring/geometry";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import type { PointRevision } from "@/lib/local-monitoring/types";
import { localProjectScope } from "./access";
import { auditLocal } from "./audit";
import { localKeywordSourceHash } from "./canonical";
import type {
  LocalDatabase,
  LocalPolicyPort,
  LocalStoreContext,
  LocalTransaction,
} from "./context";
import { LocalDeviceNotConfiguredError, LocalMeasurementUnavailableError } from "./errors";
import { retainedLocalPoint } from "./point";
import { persistLocalPointRevision } from "./point-repository";
import { localKeywordSelect } from "./repository";
import { createTargetSchema, executionTargetSchema } from "./schema";

export async function createLocalMeasurementTarget(
  command: unknown,
  context: LocalStoreContext,
  policy: LocalPolicyPort,
  db: LocalDatabase = prisma,
  serverPoint?: PointRevision,
) {
  const data = createTargetSchema.parse(command);
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(
      tx,
      context,
      data.projectId,
      "create",
      "local_measurement_target",
    );
    return createLocalMeasurementTargetInTransaction(tx, scope, data, policy, serverPoint);
  });
}

/** Caller owns the authorized project transaction. This path creates no provider work. */
export async function createLocalMeasurementTargetInTransaction(
  tx: LocalTransaction,
  scope: import("./access").LocalProjectScope,
  data: import("zod").z.infer<typeof createTargetSchema>,
  policy: LocalPolicyPort,
  serverPoint?: PointRevision,
) {
  const keyword = await tx.keyword.findFirst({
    where: {
      projectId: scope.project.id,
      publicId: data.keywordId,
      archivedAt: null,
    },
    select: localKeywordSelect,
  });
  if (!keyword) throw new LocalMeasurementUnavailableError();
  await tx.$queryRaw`SELECT id FROM keywords WHERE id=${keyword.id} FOR SHARE`;
  const locked = await tx.keyword.findFirst({
    where: { id: keyword.id, projectId: scope.project.id, archivedAt: null },
    select: localKeywordSelect,
  });
  if (!locked) throw new LocalMeasurementUnavailableError();
  if (locked.device !== data.device) throw new LocalDeviceNotConfiguredError();
  const { projectId: _project, keywordId: _keyword, latitude, longitude, ...options } = data;
  const revisions = await policy.capture(tx, {
    projectId: scope.project.id,
    keyword: locked,
    options,
  });
  const requestedPoint = createPointRevision({
    revisionId: serverPoint?.revisionId ?? randomUUID(),
    latitude,
    longitude,
  });
  const point = serverPoint ? retainedLocalPoint(serverPoint) : requestedPoint;
  if (point.revisionKey !== requestedPoint.revisionKey)
    throw new Error("Server grid point does not match requested coordinates.");
  const storedPoint = await persistLocalPointRevision(tx, scope.project.id, scope.actor.id, point);
  const target = executionTargetSchema.parse({
    version: 1,
    projectId: scope.project.id,
    keywordId: locked.id,
    ...revisions,
    pointRevision: point.revisionKey,
    ...options,
  });
  const existing = await tx.localMeasurementTarget.findFirst({
    where: {
      projectId: scope.project.id,
      targetKey: executionTargetKey(target),
    },
  });
  if (existing) return { id: existing.publicId, target, point };
  const stored = await tx.localMeasurementTarget.create({
    data: {
      publicId: makePublicId("lmt"),
      projectId: scope.project.id,
      keywordId: locked.id,
      pointId: storedPoint.id,
      targetKey: executionTargetKey(target),
      target: target as Prisma.InputJsonValue,
      keywordSnapshot: {
        ...locked,
        updatedAt: locked.updatedAt.toISOString(),
        measurementTargetEpoch: String(locked.measurementTargetEpoch),
        measurementPolicyEpoch: String(locked.measurementPolicyEpoch),
      },
      keywordSourceHash: localKeywordSourceHash(locked),
      actorId: scope.actor.id,
    },
  });
  await auditLocal(tx, scope, {
    action: "local_measurement.target_create",
    targetType: "local_measurement_target",
    targetId: stored.publicId,
    after: { targetKeyHash: stored.targetKey },
  });
  return { id: stored.publicId, target, point };
}
