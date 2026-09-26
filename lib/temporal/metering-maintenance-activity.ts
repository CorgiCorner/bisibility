import "server-only";

import { maintainMeteringShadow } from "../metering/maintenance";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";

export type MeteringMaintenanceActivityResult = { status: "completed" | "skipped" };

export async function maintainMeteringShadowActivity(): Promise<MeteringMaintenanceActivityResult> {
  if (!isScheduledMaintenanceEnabled() || process.env.METERING_SHADOW !== "on") {
    return { status: "skipped" };
  }
  await maintainMeteringShadow();
  return { status: "completed" };
}
