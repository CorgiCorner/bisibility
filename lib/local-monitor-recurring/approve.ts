import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { materializeMonitorTargets } from "@/lib/local-monitor-launch/targets";
import type { MonitorScheduleConsent } from "@/lib/local-monitor-store/model";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { setLocalMonitorScheduleIntent } from "@/lib/local-monitor-store/schedule";
import { assertFrozenQuoteSelection, assertLocalQuote } from "@/lib/local-monitoring/quote";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import { nextRecurringSlot } from "./calendar";
import { recurringMonitorsEnabled } from "./config";
import { verifyRecurringConsent } from "./consent";
import { exactCents, recurringQuoteCents } from "./cost";
import {
  approvalSnapshotSchema,
  type RecurringApprovalSnapshot,
  recurringApprovalSchema,
} from "./schema";
import { recurringCurrentSnapshot } from "./snapshot";
/** Same existing schedule mutation/CAS/replay, with immutable paid policy recorded before commit. */
export async function approveRecurringMonitor(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  if (!recurringMonitorsEnabled()) throw new Error("Recurring monitor execution is disabled.");
  const command = recurringApprovalSchema.parse(input);
  let verified: RecurringApprovalSnapshot | null = null;
  const consent: MonitorScheduleConsent = {
    async verify(tx, value) {
      const scope = await localProjectScope(tx, context, command.projectId, "update");
      const current = await recurringCurrentSnapshot(tx, scope, command);
      if (
        current.revision.id !== command.revisionId ||
        current.intent.id !== command.scheduleIntentId ||
        localDigest(current.calendar) !== localDigest(command.calendar) ||
        value.monitorRevisionId !== command.revisionId
      )
        throw new LocalMonitorConflictError();
      const resolved = await resolveManualLocalDriver(tx, {
        scope,
        definition: current.definition,
        connectionPublicId: command.connectionId,
        source: "worker",
        trigger: "scheduled",
      });
      if (resolved.kind !== "ready") throw new Error(resolved.reason);
      const driver = resolved.driver;
      await driver.ports.activation.assertRegistered(tx, driver.ports.adapter.capability);
      const targets = await materializeMonitorTargets(
        tx,
        scope,
        current.definition,
        driver.ports.policy,
      );
      if (
        localDigest(targets.map((row) => row.id).sort()) !==
        localDigest([...command.targetIds].sort())
      )
        throw new LocalMonitorConflictError();
      assertFrozenQuoteSelection(
        command.quote,
        targets.map((row) => row.target),
      );
      for (const row of targets)
        assertLocalQuote({
          quote: command.quote,
          target: row.target,
          capability: driver.ports.adapter.capability,
          providerPriceVersion: driver.ports.adapter.providerPriceVersion,
          now: value.now,
        });
      if (
        exactCents(recurringQuoteCents(command.quote)) >
        exactCents(command.maximumPerOccurrenceCents)
      )
        throw new Error("Quote exceeds ceiling.");
      const { consentToken, ...body } = command;
      verified = approvalSnapshotSchema.parse({
        ...body,
        actorId: scope.actor.id,
        internalProjectId: scope.project.id,
        connectionStamp: current.connectionStamp,
        definitionHash: current.definitionHash,
      });
      verifyRecurringConsent(consentToken, verified, value.now);
      return {
        approvalDigest: localDigest(["local-monitor-approved-recurring-v1", consentToken]),
        capabilityVersion: command.quote.capabilityVersion,
      };
    },
    async recordApproval(tx, value) {
      if (
        !verified ||
        value.actorId !== verified.actorId ||
        value.projectId !== verified.internalProjectId ||
        value.definitionRevisionId !== verified.revisionId ||
        value.monitorVersion !== verified.expectedVersion + 1
      )
        throw new LocalMonitorConflictError();
      const id = randomUUID(),
        slot = nextRecurringSlot(verified.calendar, value.monitorId, value.now);
      if (slot.dueAt >= new Date(verified.validUntil))
        throw new Error("Validity ends before the first occurrence.");
      await tx.$executeRaw`INSERT INTO local_monitor_recurring_approvals(id,"projectId","monitorId","scheduleIntentId","definitionRevisionId","monitorVersion","actorId",snapshot,"contentHash","approvalDigest","approvedAt","validUntil") VALUES (${id},${value.projectId},${value.monitorId},${value.intentId},${value.definitionRevisionId},${value.monitorVersion},${value.actorId},${JSON.stringify(verified)}::jsonb,${localDigest(verified)},${value.approvalDigest},${value.now},${new Date(verified.validUntil)})`;
      await tx.$executeRaw`INSERT INTO local_monitor_recurring_cursors("approvalId","projectId","nextOccurrenceKey","nextDueAt",state,"createdAt","updatedAt") VALUES (${id},${value.projectId},${slot.occurrenceKey},${slot.dueAt},'active',${value.now},${value.now})`;
    },
  };
  const result = await setLocalMonitorScheduleIntent(
    {
      projectId: command.projectId,
      monitorId: command.monitorId,
      expectedVersion: command.expectedVersion,
      idempotencyKey: command.idempotencyKey,
      mode: "scheduled",
      scheduleId: command.scheduleId,
      expectedScheduleEpoch: command.expectedScheduleEpoch,
      consentToken: command.consentToken,
    },
    context,
    consent,
    { db, approvalBodyHash: localDigest(command) },
  );
  await publishWorkerIntent("local_monitor");
  return result;
}
