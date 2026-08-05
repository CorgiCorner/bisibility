import "server-only";

import { assertTemporalSchedulerEnabled } from "@/lib/scheduler/driver";
import { getTemporalClient } from "./client";

export async function getSchedulerTemporalClient() {
  assertTemporalSchedulerEnabled();
  return getTemporalClient();
}
