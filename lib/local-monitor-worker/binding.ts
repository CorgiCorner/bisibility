import "server-only";
import {
  assertOccurrenceReplay,
  findMonitorOccurrence,
} from "@/lib/local-monitor-launch/occurrence";
import { insertMonitorOccurrence } from "@/lib/local-monitor-launch/occurrence-write";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { assertRecurringWorkerAuthority } from "@/lib/local-monitor-recurring/authority";
import { assertPersistedMonitorRetry } from "@/lib/local-monitor-retry/persistence";
import { assertMonitorRetryCurrent } from "@/lib/local-monitor-retry/selection";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalRunBinding, LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { MonitorWorkerClaim } from "./contracts";
import { assertMonitorClaim } from "./repository";
export function monitorWorkerBinding(
  claim: MonitorWorkerClaim,
  clock: () => Date,
): LocalRunBinding {
  const verify = async (tx: LocalTransaction, scope: LocalProjectScope) => {
    const job = await assertMonitorClaim(tx, claim, clock(), true);
    if (
      job.actorId !== scope.actor.id ||
      job.projectId !== scope.project.id ||
      job.expiresAt <= clock()
    )
      throw new LocalMonitorConflictError();
    await assertRecurringWorkerAuthority(tx, scope, job, clock());
    const snapshot = await currentMonitorLaunchSnapshot(tx, scope, job.command);
    if (
      snapshot.revision.id !== job.command.revisionId ||
      snapshot.intent.id !== job.command.scheduleIntentId ||
      snapshot.connectionStamp !== job.connectionStamp
    )
      throw new LocalMonitorConflictError();
    if (job.command.retry) {
      const retrySelection = await assertMonitorRetryCurrent(tx, {
        projectId: scope.project.id,
        monitorId: job.command.monitorId,
        retry: job.command.retry,
        revisionId: job.command.revisionId,
        scheduleIntentId: job.command.scheduleIntentId,
        targetIds: job.command.targetIds,
        now: clock(),
      });
      await assertPersistedMonitorRetry(tx, job.id, retrySelection);
    }
    return { job, snapshot };
  };
  return {
    verify: async (tx, scope) => {
      await verify(tx, scope);
    },
    replay: async (tx, scope, run) => {
      const job = await assertMonitorClaim(tx, claim, clock());
      if (
        job.actorId !== scope.actor.id ||
        job.projectId !== scope.project.id ||
        job.runId !== run.id
      )
        throw new LocalMonitorConflictError();
      const row = await findMonitorOccurrence(tx, scope.project.id, job.command);
      if (!row || row.runId !== run.id) throw new LocalMonitorConflictError();
      assertOccurrenceReplay(row, job.command, scope.actor.id);
    },
    created: async (tx, scope, run) => {
      const { job, snapshot } = await verify(tx, scope);
      if (job.runId) throw new LocalMonitorConflictError();
      await insertMonitorOccurrence(tx, scope, job.command, snapshot, run, clock(), job.origin);
      await tx.$executeRaw`UPDATE local_monitor_launch_intents SET "runId"=${run.id},version=version+1,"updatedAt"=${clock()} WHERE id=${job.id}`;
    },
  };
}
