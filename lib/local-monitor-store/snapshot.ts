import "server-only";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { assertMonitorDefinition } from "./definition";
import { LocalMonitorConflictError, type MonitorDefinition } from "./model";
/** Internal snapshot read; callers first authorize and lock their project/monitor. */
export async function loadMonitorSnapshot(
  tx: LocalTransaction,
  projectId: string,
  publicId: string,
) {
  const monitor = await tx.localMonitor.findFirst({
    where: { projectId, publicId },
  });
  if (!monitor?.currentRevisionId || !monitor.currentScheduleIntentId)
    throw new LocalMeasurementUnavailableError();
  const revision = await tx.localMonitorRevision.findFirst({
    where: { projectId, monitorId: monitor.id, id: monitor.currentRevisionId },
  });
  const intent = await tx.localMonitorScheduleIntent.findFirst({
    where: {
      projectId,
      monitorId: monitor.id,
      id: monitor.currentScheduleIntentId,
    },
  });
  if (!revision || !intent) throw new LocalMonitorConflictError();
  const definition = assertMonitorDefinition(revision.snapshot as unknown as MonitorDefinition);
  if (
    localDigest(definition) !== revision.contentHash ||
    definition.grid.revisionKey !== revision.gridRevisionKey ||
    definition.entityId !== revision.entityId ||
    definition.identityRevisionId !== revision.identityRevisionId
  )
    throw new LocalMonitorConflictError();
  const points = await tx.localMonitorGridPoint.findMany({
    where: { projectId, revisionId: revision.id },
    orderBy: { ordinal: "asc" },
  });
  const links = await tx.localMonitorKeyword.findMany({
    where: { projectId, revisionId: revision.id },
    orderBy: { ordinal: "asc" },
  });
  if (
    points.length !== definition.grid.points.length ||
    points.some((row, i) => {
      const expected = definition.grid.points[i];
      return (
        row.ordinal !== expected.ordinal ||
        row.row !== expected.row ||
        row.column !== expected.column ||
        row.pointId !== expected.point.revisionId
      );
    }) ||
    links.length !== definition.keywords.length ||
    links.some(
      (row, i) =>
        row.ordinal !== i ||
        row.keywordPublicId !== definition.keywords[i].publicId ||
        row.sourceHash !== definition.keywords[i].sourceHash ||
        (row.keywordId !== null && row.keywordId !== definition.keywords[i].id),
    )
  )
    throw new LocalMonitorConflictError();
  return { monitor, revision, intent, definition };
}
