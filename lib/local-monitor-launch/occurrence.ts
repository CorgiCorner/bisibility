import { insertMonitorOccurrence } from "./occurrence-write";
import "server-only";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalRunBinding, LocalTransaction } from "@/lib/local-monitoring-store/context";
import { verifyMonitorConsent } from "./consent";
import type { MonitorLaunchCommand } from "./contracts";
import { occurrenceBody, occurrenceKey } from "./identity";
import { currentMonitorLaunchSnapshot } from "./snapshot";
export type MonitorOccurrence = Readonly<{
  id: string;
  monitorId: string;
  monitorPublicId: string;
  actorId: string | null;
  bodyHash: string;
  runId: string;
  runPublicId: string;
}>;
export async function findMonitorOccurrence(
  tx: LocalTransaction,
  projectId: string,
  command: Omit<MonitorLaunchCommand, "consentToken">,
) {
  const rows = await tx.$queryRaw<
    MonitorOccurrence[]
  >`SELECT o.id,o."monitorId",m."publicId" AS "monitorPublicId",o."actorId",o."bodyHash",o."runId",r."publicId" AS "runPublicId"
    FROM local_monitor_occurrences o JOIN local_monitors m ON m.id=o."monitorId" AND m."projectId"=o."projectId"
    JOIN local_measurement_runs r ON r.id=o."runId" AND r."projectId"=o."projectId"
    WHERE o."projectId"=${projectId} AND o."keyHash"=${occurrenceKey(command)}`;
  if (rows.length > 1) throw new LocalMonitorConflictError();
  return rows[0] ?? null;
}
export function assertOccurrenceReplay(
  row: MonitorOccurrence,
  command: Omit<MonitorLaunchCommand, "consentToken">,
  actorId: string,
) {
  if (
    row.monitorPublicId !== command.monitorId ||
    row.actorId !== actorId ||
    row.bodyHash !== occurrenceBody(command, actorId)
  )
    throw new LocalMonitorConflictError();
  return row.runPublicId;
}
export function monitorOccurrenceBinding(
  command: MonitorLaunchCommand,
  clock: () => Date,
): LocalRunBinding {
  const verify = async (tx: LocalTransaction, scope: LocalProjectScope) => {
    // Retry requires the immutable worker-intent lineage and its per-send proof fence.
    if (command.retry) throw new LocalMonitorConflictError();
    const snapshot = await currentMonitorLaunchSnapshot(tx, scope, command);
    if (
      snapshot.revision.id !== command.revisionId ||
      snapshot.intent.id !== command.scheduleIntentId
    )
      throw new LocalMonitorConflictError();
    verifyMonitorConsent(
      command.consentToken,
      {
        actorId: scope.actor.id,
        projectId: scope.project.id,
        monitorId: command.monitorId,
        monitorVersion: command.expectedVersion,
        revisionId: command.revisionId,
        scheduleIntentId: command.scheduleIntentId,
        connectionId: command.connectionId,
        connectionStamp: snapshot.connectionStamp,
        targetIds: command.targetIds,
        idempotencyKey: command.idempotencyKey,
        quote: command.quote,
      },
      clock(),
    );
    return snapshot;
  };
  return {
    verify: async (tx, scope) => {
      await verify(tx, scope);
    },
    replay: async (tx, scope, run) => {
      const row = await findMonitorOccurrence(tx, scope.project.id, command);
      if (!row || row.runId !== run.id || row.runPublicId !== run.publicId)
        throw new LocalMonitorConflictError();
      assertOccurrenceReplay(row, command, scope.actor.id);
    },
    created: async (tx, scope, run) => {
      const snapshot = await verify(tx, scope);
      await insertMonitorOccurrence(tx, scope, command, snapshot, run, clock());
    },
  };
}
