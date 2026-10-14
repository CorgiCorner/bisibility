import "server-only";
import { randomUUID } from "node:crypto";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { localQuoteHash } from "@/lib/local-monitoring/quote";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import { requireLocalTime } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import type { MonitorLaunchCommand } from "./contracts";
import { occurrenceBody, occurrenceKey } from "./identity";
import type { currentMonitorLaunchSnapshot } from "./snapshot";
/** Caller must supply a freshly verified HMAC or immutable worker-intent authority in this transaction. */
export async function insertMonitorOccurrence(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  command: Omit<MonitorLaunchCommand, "consentToken">,
  snapshot: Awaited<ReturnType<typeof currentMonitorLaunchSnapshot>>,
  run: { id: string; publicId: string; projectId: string },
  now: Date,
  mode: "manual" | "scheduled" = "manual",
) {
  if (
    run.projectId !== scope.project.id ||
    snapshot.revision.id !== command.revisionId ||
    snapshot.intent.id !== command.scheduleIntentId
  )
    throw new LocalMonitorConflictError();
  await tx.$executeRaw`INSERT INTO local_monitor_occurrences(id,"projectId","monitorId","definitionRevisionId","scheduleIntentId","monitorVersion","actorId",mode,"keyHash","bodyHash","quoteHash","runId","createdAt") VALUES (${randomUUID()},${scope.project.id},${snapshot.monitor.id},${snapshot.revision.id},${snapshot.intent.id},${command.expectedVersion},${scope.actor.id},${mode},${occurrenceKey(command)},${occurrenceBody(command, scope.actor.id)},${localQuoteHash(command.quote)},${run.id},${requireLocalTime(now)})`;
}
