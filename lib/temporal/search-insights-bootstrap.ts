import "server-only";

import {
  type BootstrapScheduleClient,
  calendarSpec,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";

export const SEARCH_INSIGHTS_SYNC_SCHEDULE_ID = "maintenance-search-insights-sync";
export const SEARCH_INSIGHTS_SYNC_WORKFLOW_TYPE = "searchInsightsSyncWorkflow";

// 12:40 UTC sits after Pacific midnight plus the lag the provider usually needs before a
// day is finalized, so the daily run finds a new finalized day rather than an empty probe.
const DEFAULT_SEARCH_INSIGHTS_SYNC = { hour: 12, minute: 40 };

// No per-schedule cron override: the run only has to land after the provider finalizes a
// Pacific day, which is not a deployment-specific choice.
export function ensureSearchInsightsSyncSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID },
      note: "Daily search insights sync",
      scheduleId: SEARCH_INSIGHTS_SYNC_SCHEDULE_ID,
      spec: calendarSpec(DEFAULT_SEARCH_INSIGHTS_SYNC, undefined),
      workflowType: SEARCH_INSIGHTS_SYNC_WORKFLOW_TYPE,
    },
    client,
  );
}
