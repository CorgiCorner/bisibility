import { proxyActivities } from "@temporalio/workflow";
import type { MeteringMaintenanceActivityResult } from "./metering-maintenance-activity";

type MeteringMaintenanceActivities = {
  maintainMeteringShadowActivity(): Promise<MeteringMaintenanceActivityResult>;
};

const { maintainMeteringShadowActivity } = proxyActivities<MeteringMaintenanceActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "2 minutes",
});

export async function maintainMeteringShadowWorkflow(): Promise<MeteringMaintenanceActivityResult> {
  return maintainMeteringShadowActivity();
}
