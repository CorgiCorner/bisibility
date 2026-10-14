import "server-only";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { loadMonitorCalendar } from "@/lib/local-monitor-store/references";
import type { MonitorJob } from "@/lib/local-monitor-worker/contracts";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { retainedRecurringSlot } from "./calendar";
import { recurringMonitorsEnabled } from "./config";
import { exactCents, recurringQuoteCents } from "./cost";
import { loadRecurringApproval } from "./repository";
/** Renew current authority before new sends only. Retained accepted-ID collection bypasses this. */
export async function assertRecurringWorkerAuthority(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  job: MonitorJob,
  now: Date,
) {
  if (job.origin !== "scheduled") return;
  if (!recurringMonitorsEnabled() || !job.recurringApprovalId || !job.recurringOccurrenceKey)
    throw new LocalMonitorConflictError();
  const approval = await loadRecurringApproval(tx, job.recurringApprovalId),
    policy = approval.snapshot;
  const current = await currentMonitorLaunchSnapshot(tx, scope, job.command);
  const calendar = await loadMonitorCalendar(tx, scope.project.id, policy.scheduleId);
  const slot = retainedRecurringSlot(
    policy.calendar,
    approval.monitorId,
    job.recurringOccurrenceKey,
  );
  if (
    approval.actorId !== scope.actor.id ||
    approval.projectId !== scope.project.id ||
    approval.monitorId !== current.monitor.id ||
    approval.scheduleIntentId !== current.intent.id ||
    current.intent.mode !== "scheduled" ||
    approval.monitorVersion !== current.monitor.version ||
    current.revision.id !== approval.definitionRevisionId ||
    current.connectionStamp !== policy.connectionStamp ||
    localDigest(current.definition) !== policy.definitionHash ||
    localDigest(calendar) !== localDigest(policy.calendar) ||
    approval.validUntil <= now ||
    slot.dueAt < approval.approvedAt ||
    slot.dueAt > approval.validUntil ||
    job.consentDigest !== approval.approvalDigest ||
    job.command.quote.providerPriceVersion !== policy.quote.providerPriceVersion ||
    job.command.quote.capabilityVersion !== policy.quote.capabilityVersion ||
    localDigest(job.command.quote.effectiveOptions) !==
      localDigest(policy.quote.effectiveOptions) ||
    localDigest([...job.command.targetIds].sort()) !== localDigest([...policy.targetIds].sort()) ||
    localDigest([...job.command.quote.expectedTargetKeys].sort()) !==
      localDigest([...policy.quote.expectedTargetKeys].sort()) ||
    exactCents(recurringQuoteCents(job.command.quote)) >
      exactCents(policy.maximumPerOccurrenceCents)
  )
    throw new LocalMonitorConflictError();
}
