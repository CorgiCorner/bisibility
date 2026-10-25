import "server-only";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";

export const CHECK_NOTIFICATION_SUMMARIES_SCHEDULE_ID = "check-notification-summaries";
export const CHECK_NOTIFICATION_SUMMARIES_WORKFLOW_TYPE = "checkNotificationSummariesWorkflow";

export async function ensureCheckNotificationSummariesSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: true,
      memo: { kind: "check-notification-summaries" },
      note: "Grouped check notification summaries",
      scheduleId: CHECK_NOTIFICATION_SUMMARIES_SCHEDULE_ID,
      spec: {
        intervals: [{ every: "5 minutes" }],
      },
      workflowType: CHECK_NOTIFICATION_SUMMARIES_WORKFLOW_TYPE,
    },
    client,
  );
}
