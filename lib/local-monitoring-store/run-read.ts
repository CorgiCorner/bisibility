import "server-only";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { localProjectScope } from "./access";
import type { LocalDatabase, LocalStoreContext } from "./context";
import { LocalMeasurementUnavailableError } from "./errors";
import { projectRef, runRef, submissionRecordSchema } from "./schema";

const readSchema = z.object({ projectId: projectRef, runId: runRef }).strict();

/** Viewer-safe projection: provider task IDs, receipt amounts and credential custody stay internal. */
export async function readLocalMeasurementRun(
  command: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const data = readSchema.parse(command);
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, data.projectId, "read");
    const run = await tx.localMeasurementRun.findFirst({
      where: { projectId: scope.project.id, publicId: data.runId },
    });
    if (!run) throw new LocalMeasurementUnavailableError();
    const rows = await tx.localMeasurementRunItem.findMany({
      where: { projectId: scope.project.id, runId: run.id },
      orderBy: { operationKey: "asc" },
    });
    const targets = await tx.localMeasurementTarget.findMany({
      where: { projectId: scope.project.id, id: { in: rows.map(({ targetId }) => targetId) } },
      select: { id: true, publicId: true },
    });
    return {
      id: run.publicId,
      version: run.version,
      cancellationRequested: run.cancellationRequested,
      expectedCount: run.expectedTargetKeys.length,
      items: rows.map((row) => {
        const record = submissionRecordSchema.parse(row.record);
        const targetId = targets.find(({ id }) => id === row.targetId)?.publicId;
        if (!targetId || record.version !== row.version)
          throw new LocalMeasurementUnavailableError();
        return {
          targetId,
          status: record.status,
          version: record.version,
          acceptance: record.outcome?.acceptance ?? null,
          acceptedTaskCount: record.outcome?.taskIds.length ?? null,
          collected: record.collectedEvidenceId !== null,
          cancellationRequested: record.cancellationRequested,
        };
      }),
    };
  });
}
