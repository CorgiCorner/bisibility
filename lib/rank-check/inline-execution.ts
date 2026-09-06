import "server-only";

import { schedulerDriver } from "@/lib/scheduler/driver";

export function inlineRankCheckExecutionEnabled() {
  return schedulerDriver() === "none";
}
