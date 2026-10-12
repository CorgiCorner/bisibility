import "server-only";

import { maintainMeteringReservations } from "../metering/maintenance";
import { isScheduledMaintenanceEnabled } from "./maintenance-schedule-bootstrap";

export type MeteringMaintenanceActivityResult =
  | { status: "completed"; count: number; hasMore: boolean }
  | { status: "skipped" };

export async function maintainMeteringReservationsActivity(): Promise<MeteringMaintenanceActivityResult> {
  if (!isScheduledMaintenanceEnabled()) {
    return { status: "skipped" };
  }
  const result = await maintainMeteringReservations();
  return { status: "completed", ...result };
}
