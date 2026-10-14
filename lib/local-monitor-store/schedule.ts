import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { assertMonitorDefinition } from "./definition";
import {
  LocalMonitorConflictError,
  type MonitorDefinition,
  type MonitorScheduleConsent,
} from "./model";
import { mutateMonitor } from "./mutation";
import { assertMonitorSourcesCurrent, loadMonitorCalendar } from "./references";
import { scheduleIntentSchema } from "./schema";
import { lockedMonitor, receipt } from "./storage";

/** Persists intent only. The port verifies existing host consent; it cannot purchase or enqueue work. */
export async function setLocalMonitorScheduleIntent(
  command: unknown,
  context: LocalStoreContext,
  consent: MonitorScheduleConsent,
  options: { db?: LocalDatabase; clock?: () => Date; approvalBodyHash?: string } = {},
) {
  const data = scheduleIntentSchema.parse(command);
  return mutateMonitor({
    ...options,
    data: {
      ...data,
      ...(options.approvalBodyHash ? { approvalBodyHash: options.approvalBodyHash } : {}),
    },
    context,
    operation: "schedule",
    async execute(tx, scope, now) {
      const monitor = await lockedMonitor(
        tx,
        scope.project.id,
        data.monitorId,
        data.expectedVersion,
      );
      const previous = await tx.localMonitorScheduleIntent.findFirst({
        where: {
          projectId: scope.project.id,
          monitorId: monitor.id,
          id: monitor.currentScheduleIntentId!,
        },
      });
      if (!previous || !monitor.currentRevisionId) throw new LocalMonitorConflictError();
      if (data.mode === "scheduled") {
        const revision = await tx.localMonitorRevision.findFirstOrThrow({
          where: { projectId: scope.project.id, id: monitor.currentRevisionId },
        });
        await assertMonitorSourcesCurrent(
          tx,
          scope.project.id,
          assertMonitorDefinition(revision.snapshot as unknown as MonitorDefinition),
        );
      }
      const calendar =
        data.mode === "scheduled"
          ? await loadMonitorCalendar(tx, scope.project.id, data.scheduleId!)
          : null;
      if (calendar && calendar.measurementEpoch !== data.expectedScheduleEpoch)
        throw new LocalMonitorConflictError();
      const proof = calendar
        ? await consent.verify(tx, {
            actorId: scope.actor.id,
            projectId: scope.project.id,
            monitorRevisionId: monitor.currentRevisionId,
            calendar,
            token: data.consentToken!,
            now,
          })
        : null;
      if (
        proof &&
        (!/^[a-f0-9]{64}$/.test(proof.approvalDigest) ||
          !/^[\w.:-]{1,128}$/.test(proof.capabilityVersion))
      ) {
        throw new Error("Invalid verified schedule consent.");
      }
      const id = randomUUID();
      await tx.localMonitorScheduleIntent.create({
        data: {
          id,
          projectId: scope.project.id,
          monitorId: monitor.id,
          definitionRevisionId: monitor.currentRevisionId,
          previousRevisionId: previous.id,
          revision: previous.revision + 1,
          mode: data.mode,
          scheduleId: calendar?.scheduleId ?? null,
          snapshot: calendar ? (calendar as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          approvalDigest: proof?.approvalDigest ?? null,
          capabilityVersion: proof?.capabilityVersion ?? null,
          actorId: scope.actor.id,
          createdAt: now,
        },
      });
      const saved = receipt(
        await tx.localMonitor.update({
          where: { id: monitor.id },
          data: {
            currentScheduleIntentId: id,
            version: monitor.version + 1,
            updatedAt: now,
          },
        }),
      );
      if (calendar && proof && consent.recordApproval)
        await consent.recordApproval(tx, {
          actorId: scope.actor.id,
          projectId: scope.project.id,
          monitorId: monitor.id,
          intentId: id,
          definitionRevisionId: monitor.currentRevisionId,
          monitorVersion: saved.version,
          calendar,
          approvalDigest: proof.approvalDigest,
          capabilityVersion: proof.capabilityVersion,
          now,
        });
      return saved;
    },
  });
}
