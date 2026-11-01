import "server-only";
import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { pauseSingletonSchedule } from "./schedule-pause";

export const PROVIDER_ACCOUNT_CHECK_SCHEDULE_ID = "maintenance-provider-account-checks";
type ScheduleClient = BootstrapScheduleClient & Pick<Client["schedule"], "getHandle">;
export async function ensureProviderAccountCheckSchedule(
  client?: ScheduleClient,
): Promise<EnsureScheduleResult> {
  if (!isScheduledMaintenanceEnabled())
    return pauseSingletonSchedule(
      {
        scheduleId: PROVIDER_ACCOUNT_CHECK_SCHEDULE_ID,
        note: "Automatic provider account checks disabled",
        failureMessage: "[temporal] provider account checks pause failed",
      },
      client,
    );
  return ensureSingletonSchedule(
    {
      enabled: true,
      memo: { kind: PROVIDER_ACCOUNT_CHECK_SCHEDULE_ID },
      note: "Free provider account checks",
      scheduleId: PROVIDER_ACCOUNT_CHECK_SCHEDULE_ID,
      spec: { intervals: [{ every: "1 minute" }] },
      workflowType: "checkProviderAccountsWorkflow",
    },
    client,
  );
}
