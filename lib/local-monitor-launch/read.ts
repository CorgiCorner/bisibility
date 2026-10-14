import { readLatestMonitorIntent } from "@/lib/local-monitor-worker/read";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { monitorRef } from "@/lib/local-monitor-store/schema";
import { loadMonitorSnapshot } from "@/lib/local-monitor-store/snapshot";
import { readLocalHostRun } from "@/lib/local-monitoring-host/read";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { projectRef } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";
import { readOccurrenceLabels } from "./read-labels";

const inputSchema = z.object({ projectId: projectRef, monitorId: monitorRef }).strict();
/** Reading choices and the last retained run never prepares, submits, collects or schedules work. */
export async function readMonitorLaunchState(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const command = inputSchema.parse(input);
  const result = await db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, command.projectId, "read");
    const { monitor } = await loadMonitorSnapshot(tx, scope.project.id, command.monitorId);
    const connections = await tx.providerConnection.findMany({
      where: {
        projectId: scope.project.id,
        kind: "serp",
        status: "connected",
        enabled: true,
        credentialSource: "own",
      },
      select: { publicId: true, provider: true },
      orderBy: { publicId: "asc" },
    });
    const rows = await tx.$queryRaw<
      Array<{ runPublicId: string }>
    >`SELECT r."publicId" AS "runPublicId"
   FROM local_monitor_occurrences o JOIN local_measurement_runs r ON r.id=o."runId" AND r."projectId"=o."projectId"
   WHERE o."projectId"=${scope.project.id} AND o."monitorId"=${monitor.id} ORDER BY o."createdAt" DESC,o.id DESC LIMIT 1`;
    const labels = rows[0]
      ? await readOccurrenceLabels(tx, scope.project.id, rows[0].runPublicId)
      : [];
    return {
      intent: await readLatestMonitorIntent(tx, scope.project.id, monitor.id),
      labels,
      connections: connections.map((row) => ({
        id: row.publicId,
        provider: row.provider,
      })),
      runId: rows[0]?.runPublicId ?? null,
    };
  });
  const run = result.runId
    ? await readLocalHostRun({ projectId: command.projectId, runId: result.runId }, context, db)
    : null;
  if (
    run &&
    (run.items.length !== result.labels.length ||
      run.items.some((item) => !result.labels.some((label) => label.targetId === item.targetId)))
  )
    throw new LocalMeasurementUnavailableError();
  return { connections: result.connections, labels: result.labels, intent: result.intent, run };
}
