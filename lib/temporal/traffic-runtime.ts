import { ensureTrafficSyncSchedule } from "./bootstrap";

export function ensureTrafficRuntimeSchedules() {
  return [ensureTrafficSyncSchedule()];
}
