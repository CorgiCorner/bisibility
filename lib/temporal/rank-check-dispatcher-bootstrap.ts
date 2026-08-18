import "server-only";

import { isRankCheckDispatcherEnabled } from "../rank-check/dispatcher-config";
import {
  RANK_CHECK_DISPATCHER_SCHEDULE_ID,
  RANK_CHECK_DISPATCHER_WORKFLOW_TYPE,
} from "../rank-check/dispatcher-constants";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
  envValue,
} from "./bootstrap";

const DEFAULT_DISPATCHER_INTERVAL = "1 minute";

export { isRankCheckDispatcherEnabled };

function dispatcherInterval() {
  return envValue(process.env.RANK_CHECK_DISPATCHER_INTERVAL) ?? DEFAULT_DISPATCHER_INTERVAL;
}

export async function ensureRankCheckDispatcherSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isRankCheckDispatcherEnabled(),
      convergeSpec: true,
      memo: { kind: "rank-check-dispatcher" },
      note: "Due rank-check dispatcher",
      scheduleId: RANK_CHECK_DISPATCHER_SCHEDULE_ID,
      spec: { intervals: [{ every: dispatcherInterval() }] },
      workflowType: RANK_CHECK_DISPATCHER_WORKFLOW_TYPE,
    },
    client,
  );
}
