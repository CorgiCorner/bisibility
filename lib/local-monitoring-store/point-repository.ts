import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PointRevision } from "@/lib/local-monitoring/types";
import type { LocalTransaction } from "./context";
import { LocalMeasurementConflictError } from "./errors";
import { retainedLocalPoint } from "./point";

/** Root may persist its frozen grid points without regenerating IDs or cloning Keywords. */
export async function persistLocalPointRevision(
  tx: LocalTransaction,
  projectId: string,
  actorId: string,
  input: PointRevision,
) {
  const point = retainedLocalPoint(input);
  const existing = await tx.localMeasurementPoint.findFirst({
    where: { projectId, revisionKey: point.revisionKey },
  });
  if (existing) {
    const retained = retainedLocalPoint(existing.point);
    if (
      existing.id !== point.revisionId ||
      existing.contentHash !== point.contentHash ||
      retained.revisionKey !== point.revisionKey
    )
      throw new LocalMeasurementConflictError();
    return existing;
  }
  return tx.localMeasurementPoint.create({
    data: {
      id: point.revisionId,
      projectId,
      revisionKey: point.revisionKey,
      contentHash: point.contentHash,
      point: point as Prisma.InputJsonValue,
      actorId,
    },
  });
}
