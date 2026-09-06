import "server-only";

import { plannerOwnsAutomaticChecks } from "../rank-check/scheduler-mode";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
  envValue,
} from "./bootstrap";

export const RANK_CHECK_PLANNER_SCHEDULE_ID = "planner-rank-check-runs";
export const RANK_CHECK_PLANNER_WORKFLOW_TYPE = "planRankCheckRunsWorkflow";
const DEFAULT_PLANNER_INTERVAL = "15 minutes";

export function isRankCheckPlannerEnabled() {
  return plannerOwnsAutomaticChecks();
}

function plannerInterval() {
  return envValue(process.env.RANK_CHECK_PLANNER_INTERVAL) ?? DEFAULT_PLANNER_INTERVAL;
}

export function ensureRankCheckPlannerSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      convergeSpec: true,
      enabled: isRankCheckPlannerEnabled(),
      memo: { kind: "rank-check-planner" },
      note: "Planned rank-check runs",
      scheduleId: RANK_CHECK_PLANNER_SCHEDULE_ID,
      spec: { intervals: [{ every: plannerInterval() }] },
      workflowType: RANK_CHECK_PLANNER_WORKFLOW_TYPE,
    },
    client,
  );
}
