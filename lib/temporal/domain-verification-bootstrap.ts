import "server-only";
import type { Client } from "@temporalio/client";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";
import { pauseSingletonSchedule } from "./schedule-pause";

export const DOMAIN_VERIFICATION_SCHEDULE_ID = "maintenance-domain-verification";
type ScheduleClient = BootstrapScheduleClient & Pick<Client["schedule"], "getHandle">;
export async function ensureDomainVerificationSchedule(
  client?: ScheduleClient,
): Promise<EnsureScheduleResult> {
  if (!isScheduledMaintenanceEnabled())
    return pauseSingletonSchedule(
      {
        scheduleId: DOMAIN_VERIFICATION_SCHEDULE_ID,
        note: "Domain verification checks disabled",
        failureMessage: "[temporal] domain verification schedule pause failed",
      },
      client,
    );
  return ensureSingletonSchedule(
    {
      enabled: true,
      memo: { kind: DOMAIN_VERIFICATION_SCHEDULE_ID },
      note: "Domain verification checks",
      scheduleId: DOMAIN_VERIFICATION_SCHEDULE_ID,
      spec: { intervals: [{ every: "10 minutes" }] },
      workflowType: "domainVerificationWorkflow",
    },
    client,
  );
}
