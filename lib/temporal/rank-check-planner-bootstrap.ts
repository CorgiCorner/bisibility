import "server-only";

import { DEFAULT_RANK_CHECK_PLANNER_INTERVAL } from "../rank-check/planner-interval";
import {
  plannerOwnsAutomaticChecks,
  type RankCheckSchedulerMode,
  rankCheckSchedulerMode,
} from "../rank-check/scheduler-mode";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
  envValue,
} from "./bootstrap";

export const RANK_CHECK_PLANNER_SCHEDULE_ID = "planner-rank-check-runs";
export const RANK_CHECK_PLANNER_WORKFLOW_TYPE = "planRankCheckRunsWorkflow";

export function isRankCheckPlannerEnabled() {
  return plannerOwnsAutomaticChecks();
}

function plannerInterval() {
  return envValue(process.env.RANK_CHECK_PLANNER_INTERVAL) ?? DEFAULT_RANK_CHECK_PLANNER_INTERVAL;
}

export function ensureRankCheckPlannerSchedule(
  client?: BootstrapScheduleClient,
  mode: RankCheckSchedulerMode = rankCheckSchedulerMode(),
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      convergeSpec: true,
      enabled: plannerOwnsAutomaticChecks(mode),
      memo: { kind: "rank-check-planner" },
      note: "Planned rank-check runs",
      scheduleId: RANK_CHECK_PLANNER_SCHEDULE_ID,
      spec: { intervals: [{ every: plannerInterval() }] },
      workflowType: RANK_CHECK_PLANNER_WORKFLOW_TYPE,
    },
    client,
  );
}
