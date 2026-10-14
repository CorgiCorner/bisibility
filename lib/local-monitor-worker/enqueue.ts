import "server-only";
import { randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { verifyMonitorConsent } from "@/lib/local-monitor-launch/consent";
import {
  MonitorLaunchUnavailableError,
  monitorLaunchSchema,
} from "@/lib/local-monitor-launch/contracts";
import { occurrenceBody, occurrenceKey } from "@/lib/local-monitor-launch/identity";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { persistMonitorRetry } from "@/lib/local-monitor-retry/persistence";
import { assertMonitorRetryCurrent } from "@/lib/local-monitor-retry/selection";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import { requireLocalTime } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { schedulerDriver } from "@/lib/scheduler/driver";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import { monitorWorkerPolicy } from "./policy";
import { approvalDigest, loadMonitorJob, publicMonitorIntent } from "./repository";
/** Only records verified consent. No provider factory, reservation, submit or retrieval is reachable. */
export async function enqueueMonitorLaunch(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
  clock = () => new Date(),
) {
  if (schedulerDriver() === "none") throw new MonitorLaunchUnavailableError("worker_unavailable");
  const inputCommand = monitorLaunchSchema.parse(input);
  const { consentToken, ...command } = inputCommand;
  const receipt = await db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, command.projectId, "create");
    const now = requireLocalTime(clock());
    const previous = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM local_monitor_launch_intents WHERE "projectId"=${scope.project.id} AND "keyHash"=${occurrenceKey(command)}`;
    if (previous[0]) {
      const job = await loadMonitorJob(tx, previous[0].id, true);
      if (
        !job ||
        job.actorId !== scope.actor.id ||
        job.bodyHash !== occurrenceBody(command, scope.actor.id)
      )
        throw new LocalMonitorConflictError();
      return { replayed: true, intent: publicMonitorIntent(job) };
    }
    const snapshot = await currentMonitorLaunchSnapshot(tx, scope, command);
    if (
      snapshot.revision.id !== command.revisionId ||
      snapshot.intent.id !== command.scheduleIntentId
    )
      throw new LocalMonitorConflictError();
    const retrySelection = command.retry
      ? await assertMonitorRetryCurrent(tx, {
          projectId: scope.project.id,
          monitorId: command.monitorId,
          retry: command.retry,
          revisionId: command.revisionId,
          scheduleIntentId: command.scheduleIntentId,
          targetIds: command.targetIds,
          now,
        })
      : null;
    const proof = verifyMonitorConsent(
      consentToken,
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
        ...(command.retry ? { retry: command.retry } : {}),
      },
      now,
    );
    const id = randomUUID(),
      publicId = makePublicId("lmj");
    const policy = monitorWorkerPolicy(now);
    const expiresAt = new Date(Math.min(proof.exp * 1000, Date.parse(command.quote.expiresAt)));
    await tx.$executeRaw`INSERT INTO local_monitor_launch_intents(id,"publicId","projectId","monitorId","actorId",command,"bodyHash","keyHash","connectionStamp","consentDigest","approvedAt","expiresAt","pollIntervalMs","collectionDeadline",state,"createdAt","updatedAt") VALUES (${id},${publicId},${scope.project.id},${snapshot.monitor.id},${scope.actor.id},${JSON.stringify(command)}::jsonb,${occurrenceBody(command, scope.actor.id)},${occurrenceKey(command)},${snapshot.connectionStamp},${approvalDigest(consentToken)},${now},${expiresAt},${policy.pollIntervalMs},${policy.collectionDeadline},'queued',${now},${now})`;
    if (retrySelection) await persistMonitorRetry(tx, id, retrySelection, now);
    await writeAudit(
      {
        action: "local_monitor.enqueue",
        actorId: scope.actor.id,
        projectId: scope.project.id,
        targetType: "local_monitor",
        targetId: command.monitorId,
        requestContext: context.requestContext,
        after: {
          operation: "enqueue",
          state: "queued",
          version: command.expectedVersion,
          revisionId: command.revisionId,
          scheduleIntentId: command.scheduleIntentId,
          keyHash: occurrenceKey(command),
          bodyHash: occurrenceBody(command, scope.actor.id),
        },
      },
      tx,
    );
    const job = await loadMonitorJob(tx, id);
    if (!job) throw new LocalMonitorConflictError();
    return { replayed: false, intent: publicMonitorIntent(job) };
  });
  await publishWorkerIntent("local_monitor");
  return receipt;
}
