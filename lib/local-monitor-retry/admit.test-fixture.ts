import { nativeOccurrenceKey } from "@/lib/local-monitor-launch/identity";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import type { resultsAcceptanceDatabase } from "@/lib/local-monitor-results/acceptance.postgres.test-fixture";
import { monitorWorkerBinding } from "@/lib/local-monitor-worker/binding";
import { claimMonitorJob } from "@/lib/local-monitor-worker/claim";
import { loadMonitorJob } from "@/lib/local-monitor-worker/repository";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import { prepareLocalMeasurementRun } from "@/lib/local-monitoring-store/prepare-run";
import { assertMonitorRetryCurrent } from "./selection";
export async function admitQueuedMonitor(
  f: Pick<
    Awaited<ReturnType<typeof resultsAcceptanceDatabase>>,
    "db" | "project" | "writerContext"
  >,
  jobId: string,
) {
  const clock = () => new Date(),
    claim = await claimMonitorJob(jobId, f.db, clock);
  if (!claim) throw new Error("Actual worker claim refused.");
  const resolved = await f.db.$transaction(async (tx) => {
    const job = await loadMonitorJob(tx, jobId);
    if (!job) throw new Error("Actual worker intent missing.");
    const scope = await localProjectScope(tx, f.writerContext, f.project.publicId, "create"),
      snapshot = await currentMonitorLaunchSnapshot(tx, scope, job.command);
    const retry = job.command.retry
      ? await assertMonitorRetryCurrent(tx, {
          projectId: scope.project.id,
          monitorId: job.command.monitorId,
          retry: job.command.retry,
          revisionId: job.command.revisionId,
          scheduleIntentId: job.command.scheduleIntentId,
          targetIds: job.command.targetIds,
          now: clock(),
        })
      : null;
    const value = await resolveManualLocalDriver(tx, {
      scope,
      definition: snapshot.definition,
      connectionPublicId: job.command.connectionId,
      source: "app",
      trigger: "manual",
      ...(retry
        ? { retryTargetKeys: retry.targets.map(({ target }) => executionTargetKey(target)) }
        : {}),
    });
    if (value.kind !== "ready") throw new Error("Actual registered Maps driver refused.");
    return { job, driver: value.driver };
  });
  return prepareLocalMeasurementRun(
    {
      projectId: f.project.publicId,
      connectionId: resolved.job.command.connectionId,
      targetIds: resolved.job.command.targetIds,
      quote: resolved.job.command.quote,
      idempotencyKey: nativeOccurrenceKey(resolved.job.command),
      source: "app",
      trigger: "manual",
    },
    f.writerContext,
    resolved.driver.ports,
    f.db,
    {
      binding: monitorWorkerBinding(claim, clock),
      adapterForItem: resolved.driver.bindPreparedItem,
    },
  );
}
