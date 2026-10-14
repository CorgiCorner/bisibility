import "server-only";
import { currentMonitorLaunchSnapshot } from "@/lib/local-monitor-launch/snapshot";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { loadMonitorCalendar } from "@/lib/local-monitor-store/references";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { calendarSchema, type RecurringPreviewCommand } from "./schema";
export async function recurringCurrentSnapshot(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  command: RecurringPreviewCommand,
) {
  const snapshot = await currentMonitorLaunchSnapshot(tx, scope, command);
  const calendar = calendarSchema.parse(
    await loadMonitorCalendar(tx, scope.project.id, command.scheduleId),
  );
  if (calendar.measurementEpoch !== command.expectedScheduleEpoch)
    throw new LocalMonitorConflictError();
  return { ...snapshot, calendar, definitionHash: localDigest(snapshot.definition) };
}
