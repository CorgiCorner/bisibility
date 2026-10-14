import "server-only";
import { requirePublicId } from "@/lib/db/public-id-resources";
import { readLocalHostRun } from "@/lib/local-monitoring-host/read";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { continueMonitorItem } from "./continuation-item";
import type { MonitorWorkerClaim, MonitorWorkflowProgress } from "./contracts";
import { monitorProgress } from "./progress";
import { assertMonitorClaim, loadMonitorJob, transitionMonitorJob } from "./repository";
export async function continueMonitorRun(
  claim: MonitorWorkerClaim,
  db: LocalDatabase,
  clock: () => Date,
): Promise<MonitorWorkflowProgress> {
  const retained = await db.$transaction(async (tx) => {
    const first = await loadMonitorJob(tx, claim.id);
    if (!first?.actorId || !first.runId) throw new Error("Retained worker run is missing.");
    const context = { actor: { id: first.actorId } };
    const scope = await localProjectScope(tx, context, first.command.projectId, "update");
    const job = await assertMonitorClaim(tx, claim, clock(), true);
    if (!job.runId) throw new Error("Retained run is missing.");
    const run = await tx.localMeasurementRun.findFirstOrThrow({
      where: { id: job.runId, projectId: scope.project.id },
    });
    return { job, context, run };
  });
  const blockedTargets = new Set<string>();
  for (const targetId of retained.job.command.targetIds) {
    try {
      if (
        (await continueMonitorItem(
          {
            projectId: retained.job.command.projectId,
            runId: requirePublicId(retained.run.publicId, "lmr"),
            targetId,
          },
          retained.context,
          claim,
          db,
          clock,
        )) === "blocked"
      )
        blockedTargets.add(targetId);
    } catch {
      blockedTargets.add(targetId);
    }
  }
  const view = await readLocalHostRun(
    { projectId: retained.job.command.projectId, runId: retained.run.publicId },
    retained.context,
    db,
  );
  const state = monitorProgress(
    view.items,
    blockedTargets,
    retained.job.collectionDeadline,
    clock(),
  );
  await db.$transaction(async (tx) => {
    if (state !== "pending")
      return transitionMonitorJob(
        tx,
        claim,
        state,
        state === "complete"
          ? null
          : blockedTargets.size
            ? "provider_evidence_required"
            : "unavailable",
        clock(),
      );
    await assertMonitorClaim(tx, claim, clock());
    await tx.$executeRaw`UPDATE local_monitor_launch_intents SET "leaseExpiresAt"=${new Date(clock().getTime() + retained.job.pollIntervalMs)},version=version+1,"updatedAt"=${clock()} WHERE id=${retained.job.id}`;
  });
  return {
    state,
    nextPollMs: state !== "pending" ? null : retained.job.pollIntervalMs,
  };
}
