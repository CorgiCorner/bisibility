import "server-only";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { materializeMonitorTargets } from "@/lib/local-monitor-launch/targets";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { loadMonitorCalendar } from "@/lib/local-monitor-store/references";
import { assertFrozenQuoteSelection, assertLocalQuote } from "@/lib/local-monitoring/quote";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { RecurringApproval } from "./repository";
/** Current registered factory and exact quote, DB-only. Old quote is never extended or reused. */
export async function prepareRecurringOccurrence(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  approval: RecurringApproval,
  occurrenceKey: string,
  now: Date,
) {
  const policy = approval.snapshot;
  const idempotencyKey = localDigest([
    "local-monitor-recurring-occurrence-v1",
    approval.id,
    occurrenceKey,
  ]);
  const command = {
    projectId: policy.projectId,
    monitorId: policy.monitorId,
    expectedVersion: approval.monitorVersion,
    connectionId: policy.connectionId,
    idempotencyKey,
  };
  const current = await currentMonitorLaunchSnapshot(tx, scope, command),
    calendar = await loadMonitorCalendar(tx, scope.project.id, policy.scheduleId);
  if (
    approval.actorId !== scope.actor.id ||
    current.monitor.id !== approval.monitorId ||
    current.intent.mode !== "scheduled" ||
    current.intent.id !== approval.scheduleIntentId ||
    current.revision.id !== approval.definitionRevisionId ||
    current.connectionStamp !== policy.connectionStamp ||
    localDigest(current.definition) !== policy.definitionHash ||
    localDigest(calendar) !== localDigest(policy.calendar)
  )
    throw new LocalMonitorConflictError();
  const result = await resolveManualLocalDriver(tx, {
    scope,
    definition: current.definition,
    connectionPublicId: policy.connectionId,
    source: "worker",
    trigger: "scheduled",
  });
  if (result.kind !== "ready") throw new Error(result.reason);
  const driver = result.driver;
  await driver.ports.activation.assertRegistered(tx, driver.ports.adapter.capability);
  const targets = await materializeMonitorTargets(
    tx,
    scope,
    current.definition,
    driver.ports.policy,
  );
  if (
    localDigest(targets.map((row) => row.id).sort()) !== localDigest([...policy.targetIds].sort())
  )
    throw new LocalMonitorConflictError();
  const quote = await driver.quote(tx, { projectId: scope.project.id, targets, now });
  assertFrozenQuoteSelection(
    quote,
    targets.map((row) => row.target),
  );
  for (const row of targets)
    assertLocalQuote({
      quote,
      target: row.target,
      capability: driver.ports.adapter.capability,
      providerPriceVersion: driver.ports.adapter.providerPriceVersion,
      now,
    });
  return {
    ...command,
    revisionId: current.revision.id,
    scheduleIntentId: current.intent.id,
    targetIds: targets.map((row) => row.id).sort(),
    quote,
  };
}
