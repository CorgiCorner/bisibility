import "server-only";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { monitorPilotGridSupported } from "@/lib/local-monitor-store/pilot-grid";
import { assertMonitorSourcesCurrent } from "@/lib/local-monitor-store/references";
import { loadMonitorSnapshot } from "@/lib/local-monitor-store/snapshot";
import { lockedMonitor } from "@/lib/local-monitor-store/storage";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { providerConnectionRevision } from "@/lib/providers/connection-revision";
import type { MonitorPreviewCommand } from "./contracts";
export async function currentMonitorLaunchSnapshot(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  command: MonitorPreviewCommand,
) {
  await lockedMonitor(tx, scope.project.id, command.monitorId, command.expectedVersion);
  const snapshot = await loadMonitorSnapshot(tx, scope.project.id, command.monitorId);
  if (!monitorPilotGridSupported(snapshot.definition.grid.size))
    throw new LocalMonitorConflictError();
  await assertMonitorSourcesCurrent(tx, scope.project.id, snapshot.definition);
  await tx.$queryRaw`SELECT id FROM provider_connections WHERE "projectId"=${scope.project.id} AND "publicId"=${command.connectionId} FOR SHARE`;
  const connection = await tx.providerConnection.findFirst({
    where: { projectId: scope.project.id, publicId: command.connectionId },
    select: {
      id: true,
      provider: true,
      kind: true,
      status: true,
      credentialSource: true,
      enabled: true,
      projectId: true,
      providerUiRevision: true,
      credentialsEncrypted: true,
    },
  });
  if (
    connection?.kind !== "serp" ||
    connection.status !== "connected" ||
    !connection.enabled ||
    connection.credentialSource !== "own"
  )
    throw new LocalMonitorConflictError();
  return {
    ...snapshot,
    connectionStamp: providerConnectionRevision(connection),
  };
}
