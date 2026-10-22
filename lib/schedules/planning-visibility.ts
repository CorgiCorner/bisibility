import "server-only";

import {
  DEFAULT_RANK_CHECK_PLANNER_INTERVAL,
  plannerIntervalMinutes,
} from "@/lib/rank-check/planner-interval";
import { plannerOwnsAutomaticChecks } from "@/lib/rank-check/scheduler-mode";

export function schedulePlanningMinutes() {
  if (!plannerOwnsAutomaticChecks()) return null;
  return plannerIntervalMinutes(
    process.env.RANK_CHECK_PLANNER_INTERVAL?.trim() || DEFAULT_RANK_CHECK_PLANNER_INTERVAL,
  );
}
