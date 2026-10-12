import { continueAsNew, proxyActivities } from "@temporalio/workflow";
import type { MeteringMaintenanceActivityResult } from "./metering-maintenance-activity";

type MeteringMaintenanceActivities = {
  maintainMeteringReservationsActivity(): Promise<MeteringMaintenanceActivityResult>;
};

const { maintainMeteringReservationsActivity } = proxyActivities<MeteringMaintenanceActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "2 minutes",
});

export async function maintainMeteringReservationsWorkflow(): Promise<MeteringMaintenanceActivityResult> {
  const result = await maintainMeteringReservationsActivity();
  if (result.status === "completed" && result.hasMore && result.count > 0)
    return continueAsNew<typeof maintainMeteringReservationsWorkflow>();
  return result;
}
