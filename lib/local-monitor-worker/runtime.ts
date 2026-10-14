import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { MonitorLaunchUnavailableError } from "@/lib/local-monitor-launch/contracts";
import { executePreparedMonitorRun } from "@/lib/local-monitor-launch/execute";
import { nativeOccurrenceKey } from "@/lib/local-monitor-launch/identity";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { assertRecurringWorkerAuthority } from "@/lib/local-monitor-recurring/authority";
import { assertPersistedMonitorRetry } from "@/lib/local-monitor-retry/persistence";
import { assertMonitorRetryCurrent } from "@/lib/local-monitor-retry/selection";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { prepareLocalMeasurementRun } from "@/lib/local-monitoring-store/prepare-run";
import { monitorWorkerBinding } from "./binding";
import { claimMonitorJob } from "./claim";
import { continueMonitorRun } from "./continuation";
import type { MonitorWorkflowProgress } from "./contracts";
import { assertMonitorClaim, loadMonitorJob, transitionMonitorJob } from "./repository";
/** The only production caller of freshly minted Local submitters is this worker activity. */
export async function executeMonitorJob(
  id: string,
  db: LocalDatabase = prisma,
): Promise<MonitorWorkflowProgress> {
  const clock = () => new Date();
  const claim = await claimMonitorJob(id, db, clock);
  if (!claim) {
    const job = await db.$transaction((tx) => loadMonitorJob(tx, id));
    if (!job) return { state: "blocked", nextPollMs: null };
    if (job.state === "complete" || job.state === "blocked")
      return { state: job.state, nextPollMs: null };
    return { state: "pending", nextPollMs: job.pollIntervalMs ?? 30_000 };
  }
  try {
    const preparedContext = await db.$transaction(async (tx) => {
      const initial = await loadMonitorJob(tx, claim.id);
      if (!initial?.actorId) throw new AuthorizationError("forbidden");
      const context = { actor: { id: initial.actorId } };
      const scope = await localProjectScope(tx, context, initial.command.projectId, "create");
      const job = await assertMonitorClaim(tx, claim, clock(), true);
      if (!job.actorId) throw new AuthorizationError("forbidden");
      if (job.runId) return { kind: "retained" as const, job, context };
      if (job.expiresAt <= clock()) return { kind: "expired" as const, job, context };
      await assertRecurringWorkerAuthority(tx, scope, job, clock());
      const snapshot = await currentMonitorLaunchSnapshot(tx, scope, job.command);
      if (snapshot.connectionStamp !== job.connectionStamp)
        throw new Error("Monitor connection changed.");
      const retrySelection = job.command.retry
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
      if (retrySelection) await assertPersistedMonitorRetry(tx, job.id, retrySelection);
      const resolved = await resolveManualLocalDriver(tx, {
        scope,
        definition: snapshot.definition,
        connectionPublicId: job.command.connectionId,
        ...(retrySelection
          ? {
              retryTargetKeys: retrySelection.targets.map(({ target }) =>
                executionTargetKey(target),
              ),
            }
          : {}),
        source: job.origin === "scheduled" ? "worker" : "app",
        trigger: job.origin,
      });
      if (resolved.kind !== "ready") throw new MonitorLaunchUnavailableError(resolved.reason);
      return { kind: "fresh" as const, job, context, driver: resolved.driver };
    });
    if (preparedContext.kind === "expired") {
      await db.$transaction((tx) => transitionMonitorJob(tx, claim, "blocked", "expired", clock()));
      return { state: "blocked", nextPollMs: null };
    }
    if (preparedContext.kind === "fresh") {
      const { job, context, driver } = preparedContext;
      const prepared = await prepareLocalMeasurementRun(
        {
          projectId: job.command.projectId,
          connectionId: job.command.connectionId,
          targetIds: job.command.targetIds,
          quote: job.command.quote,
          idempotencyKey: nativeOccurrenceKey(job.command),
          source: job.origin === "scheduled" ? "worker" : "app",
          trigger: job.origin,
        },
        context,
        driver.ports,
        db,
        { binding: monitorWorkerBinding(claim, clock), adapterForItem: driver.bindPreparedItem },
      );
      // This helper invokes each in-process permit once. The following recovery also handles pre-send failures.
      await executePreparedMonitorRun(prepared, async () => undefined);
    }
    return await continueMonitorRun(claim, db, clock);
  } catch (error) {
    const job = await db.$transaction((tx) => assertMonitorClaim(tx, claim, clock()));
    if (job.runId) {
      if (!(error instanceof AuthorizationError || error instanceof ProjectReadOnlyError))
        throw error;
      await db.$transaction((tx) =>
        transitionMonitorJob(tx, claim, "blocked", "access_revoked", clock()),
      );
      return { state: "blocked", nextPollMs: null };
    }
    await db.$transaction((tx) =>
      transitionMonitorJob(
        tx,
        claim,
        "blocked",
        job.expiresAt <= clock() ? "expired" : "admission_refused",
        clock(),
      ),
    );
    return { state: "blocked", nextPollMs: null };
  }
}
